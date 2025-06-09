import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import {
  DocumentAIConfig,
  DocumentAIServiceInterface,
  ProcessedDocument,
  ExtractedInvoiceData,
  DocumentAIEntity,
  DocumentAIProperty,
  ParsedLineItem
} from '../types/document-ai';
import { DOCUMENT_AI_ENTITIES } from '../constants/document-ai-schema';

interface LineItemEntity {
  type: string;
  text: string;
  xPosition: number;
}

export class DocumentAIService implements DocumentAIServiceInterface {
  private client: DocumentProcessorServiceClient;
  private processorPath: string;

  constructor(private config: DocumentAIConfig) {
    console.log('Initializing Document AI service with config:', {
      projectId: config.projectId,
      location: config.location,
      processorId: config.processorId
    });
    
    try {
      this.client = new DocumentProcessorServiceClient({
        apiEndpoint: `${config.location}-documentai.googleapis.com`
      });      
      
      this.processorPath = `projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}`;
      
      console.log('Document AI service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Document AI service:', error);
      throw error;
    }
  }

  async processDocument(buffer: Buffer, mimeType?: string): Promise<ProcessedDocument> {
    try {
      const request = {
        name: this.processorPath,
        rawDocument: {
          content: buffer.toString('base64'),
          mimeType: mimeType || 'application/pdf'
        },
        extractFormFields: true
      };

      const [result] = await this.client.processDocument(request);
      if (!result.document) {
        throw new Error('No document in response');
      }

      // Log raw response for debugging
      console.log('Raw Document AI response:', JSON.stringify(result.document, null, 2));

      return {
        text: result.document.text || '',
        entities: (result.document.entities || []).map(entity => ({
          type: entity.type || '',
          mentionText: entity.mentionText || '',
          confidence: Number(entity.confidence) || 0,
          properties: entity.properties?.map(prop => ({
            type: prop.type || '',
            mentionText: prop.mentionText || '',
            confidence: Number(prop.confidence) || 0
          })) || [],
          pageAnchor: entity.pageAnchor ? {
            pageRefs: entity.pageAnchor.pageRefs?.map(ref => ({
              page: String(ref.page || ''),
              boundingBox: ref.boundingPoly ? {
                normalizedVertices: ref.boundingPoly.normalizedVertices?.map(vertex => ({
                  x: Number(vertex.x) || 0,
                  y: Number(vertex.y) || 0
                })) || []
              } : undefined
            })) || []
          } : undefined
        }))
      };
    } catch (error) {
      console.error('Document AI processing failed:', error);
      throw error;
    }
  }

  async extractInvoiceData(document: ProcessedDocument): Promise<ExtractedInvoiceData> {
    const entities = document.entities || [];
    
    // Log all entities for debugging
    console.log('Raw Document AI entities:', entities.map((e: DocumentAIEntity) => ({
      type: e.type,
      text: e.mentionText,
      confidence: e.confidence,
      properties: e.properties?.map((p: DocumentAIProperty) => ({
        type: p.type,
        text: p.mentionText
      }))
    })));

    const extractEntity = (type: string): string => {
      const entity = entities.find((e: DocumentAIEntity) => e.type === type);
      if (entity) {
        console.log(`Found ${type}:`, entity.mentionText);
      } else {
        console.log(`No entity found for type: ${type}`);
      }
      return entity?.mentionText || '';
    };

    const extractAmount = (type: string): number => {
      const amountStr = extractEntity(type);
      const amount = parseFloat(amountStr) || 0;
      console.log(`Extracted amount for ${type}:`, { raw: amountStr, parsed: amount });
      return amount;
    };

    // Extract line items and VAT data from the document
    const lineItems = this.extractLineItems(document);
    const vat = this.extractVatData(document);
    
    console.log('Extracted line items:', lineItems);
    console.log('Extracted VAT entries:', vat);

    const extractedData = {
      vendorName: extractEntity(DOCUMENT_AI_ENTITIES.VENDOR_NAME),
      customerName: extractEntity(DOCUMENT_AI_ENTITIES.CUSTOMER_NAME),
      invoiceNumber: extractEntity(DOCUMENT_AI_ENTITIES.INVOICE_NUMBER),
      invoiceDate: extractEntity(DOCUMENT_AI_ENTITIES.INVOICE_DATE),
      dueDate: extractEntity(DOCUMENT_AI_ENTITIES.DUE_DATE),
      totalAmount: extractAmount(DOCUMENT_AI_ENTITIES.TOTAL_AMOUNT),
      totalTaxAmount: extractAmount(DOCUMENT_AI_ENTITIES.TOTAL_TAX_AMOUNT),
      currency: extractEntity(DOCUMENT_AI_ENTITIES.CURRENCY),
      'line-items': lineItems,
      vat
    };

    console.log('Final extracted data:', extractedData);

    // Validate the totals using Document AI's extracted values
    this.validateInvoiceTotals(document, extractedData);

    return extractedData;
  }

  private extractLineItems(document: ProcessedDocument): ExtractedInvoiceData['line-items'] {
    const entities = document.entities || [];
    
    // Log unique entity types to help debug schema matching
    const uniqueTypes = new Set(entities.map((e: DocumentAIEntity) => e.type));
    console.log('All entity types found:', Array.from(uniqueTypes));
    
    const rawLineItems: ParsedLineItem[] = [];
    let currentLineItem: ParsedLineItem | null = null;

    // Get the base line items type from the schema
    const lineItemsType = DOCUMENT_AI_ENTITIES.LINE_ITEMS.DESCRIPTION.split('/')[0]; // 'line-items'
    const lineItemFields = {
      unitPrice: DOCUMENT_AI_ENTITIES.LINE_ITEMS.UNIT_PRICE.split('/')[1],
      total: DOCUMENT_AI_ENTITIES.LINE_ITEMS.TOTAL.split('/')[1],
      description: DOCUMENT_AI_ENTITIES.LINE_ITEMS.DESCRIPTION.split('/')[1],
      position: DOCUMENT_AI_ENTITIES.LINE_ITEMS.POSITION.split('/')[1],
      quantity: DOCUMENT_AI_ENTITIES.LINE_ITEMS.QUANTITY.split('/')[1]
    };

    // Process entities as a flat stream
    for (const entity of entities) {
      console.log('Processing entity:', {
        type: entity.type,
        text: entity.mentionText,
        confidence: entity.confidence,
        properties: entity.properties?.map(p => ({ type: p.type, text: p.mentionText }))
      });

      if (entity.type === lineItemsType) {
        if (currentLineItem) {
          console.log('Pushing completed line item:', currentLineItem);
          rawLineItems.push(currentLineItem);
        }
        currentLineItem = {};
        
        // Process properties if they exist
        if (entity.properties && entity.properties.length > 0) {
          for (const prop of entity.properties) {
            if (Object.values(lineItemFields).includes(prop.type)) {
              const fieldKey = Object.entries(lineItemFields).find(([_, value]) => value === prop.type)?.[0];
              if (fieldKey) {
                currentLineItem[fieldKey as keyof ParsedLineItem] = prop.mentionText || '';
                console.log('Added property to current line item:', {
                  field: fieldKey,
                  value: prop.mentionText
                });
              }
            }
          }
        }
      } else if (currentLineItem && Object.values(lineItemFields).includes(entity.type)) {
        const fieldKey = Object.entries(lineItemFields).find(([_, value]) => value === entity.type)?.[0];
        if (fieldKey) {
          currentLineItem[fieldKey as keyof ParsedLineItem] = entity.mentionText || '';
          console.log('Added field to current line item:', {
            field: fieldKey,
            value: entity.mentionText
          });
        }
      }
    }

    // Push the last line item if present
    if (currentLineItem) {
      console.log('Pushing final line item:', currentLineItem);
      rawLineItems.push(currentLineItem);
    }

    // Transform raw line items into expected format
    const lineItems = rawLineItems.map((item, index) => {
      // Parse total price from amount field
      const totalPrice = parseFloat(item.total || '0');
      
      // Parse quantity, defaulting to 1 if not found
      const quantity = parseFloat(item.quantity || '1');
      
      // Parse unit price, if both unit price and quantity are missing, 
      // use total price as unit price with quantity of 1
      let unitPrice = parseFloat(item.unitPrice || '0');
      if (unitPrice === 0 && !item.unitPrice && !item.quantity) {
        unitPrice = totalPrice;
      }
      
      // Parse position
      const positionMatch = item.position?.match(/[0-9]+/) || [(index + 1).toString()];
      const position = parseInt(positionMatch[0], 10);

      return {
        description: item.description?.trim() || '',
        quantity,
        unitPrice,
        totalPrice,
        position
      };
    });

    console.log('Extracted line items:', lineItems);
    return lineItems;
  }

  private extractVatData(document: ProcessedDocument): ExtractedInvoiceData['vat'] {
    const vatEntries: ExtractedInvoiceData['vat'] = [];
    const entities = document.entities || [];

    // Find all VAT entities
    const vatEntities = entities.filter(e => e.type === 'vat');
    console.log('Found VAT entries:', vatEntities.length);

    // Process each VAT entry
    vatEntities.forEach((entity, index) => {
      const properties = entity.properties || [];
      console.log(`Processing VAT entry ${index + 1} properties:`, properties.map(p => ({
        type: p.type,
        text: p.mentionText
      })));

      // Extract values from properties
      const amount = properties.find(p => p.type === 'amount')?.mentionText;
      const categoryCode = properties.find(p => p.type === 'category-code')?.mentionText;
      const taxAmount = properties.find(p => p.type === 'tax-amount')?.mentionText;
      const taxRate = properties.find(p => p.type === 'tax-rate')?.mentionText;

      const parsedAmount = amount ? parseFloat(amount) : 0;
      const parsedTaxAmount = taxAmount ? parseFloat(taxAmount) : 0;
      const parsedTaxRate = taxRate ? parseFloat(taxRate) : 0;

      const vatEntry = {
        amount: parsedAmount,
        categoryCode: categoryCode || '',
        taxAmount: parsedTaxAmount,
        taxRate: parsedTaxRate
      };

      // Only add VAT entry if we have some valid data
      if (parsedAmount > 0 || parsedTaxAmount > 0 || parsedTaxRate > 0 || categoryCode) {
        console.log('Created VAT entry:', vatEntry);
        vatEntries.push(vatEntry);
      }
    });

    return vatEntries;
  }

  private validateInvoiceTotals(document: ProcessedDocument, extractedData: ExtractedInvoiceData): boolean {
    const entities = document.entities || [];
    
    // Get the document's total amount
    const totalAmountEntity = entities.find(e => e.type === DOCUMENT_AI_ENTITIES.TOTAL_AMOUNT);
    if (!totalAmountEntity) {
      throw new Error('Could not find total amount in document');
    }
    
    const documentTotal = parseFloat(totalAmountEntity.mentionText);
    if (isNaN(documentTotal)) {
      throw new Error('Invalid total amount format in document');
    }

    // Calculate sum of line items
    const lineItemTotal = extractedData['line-items'].reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Allow for small rounding differences (0.01)
    if (Math.abs(lineItemTotal - documentTotal) > 0.01) {
      throw new Error(
        `Total amount mismatch: Line items sum to ${lineItemTotal.toFixed(2)} but document shows ${documentTotal.toFixed(2)}`
      );
    }

    // Validate each line item's total matches quantity × unit price
    for (const item of extractedData['line-items']) {
      // Skip validation if we're using the fallback case (no unit price and quantity provided)
      const calculatedTotal = item.quantity * item.unitPrice;
      if (Math.abs(calculatedTotal - item.totalPrice) > 0.01 && item.unitPrice !== item.totalPrice) {
        throw new Error(
          `Line item "${item.description}" total is incorrect: ${item.quantity} × ${item.unitPrice.toFixed(2)} should be ${calculatedTotal.toFixed(2)}, but got ${item.totalPrice.toFixed(2)}`
        );
      }
    }

    return true;
  }
} 