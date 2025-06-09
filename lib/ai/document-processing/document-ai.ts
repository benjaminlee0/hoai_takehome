import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai';
import { ProcessedAttachment, TableCell, TableStructure } from './types';

interface DocumentAIConfig {
  projectId: string;
  location: string;
  processorId: string;
}

type GoogleDocument = protos.google.cloud.documentai.v1.IDocument;
type GooglePage = protos.google.cloud.documentai.v1.Document.IPage;
type GoogleTable = protos.google.cloud.documentai.v1.Document.Page.ITable;
type GoogleTableRow = protos.google.cloud.documentai.v1.Document.Page.Table.ITableRow;
type GoogleTableCell = protos.google.cloud.documentai.v1.Document.Page.Table.ITableCell;

export class DocumentAIService {
  private client: DocumentProcessorServiceClient;
  private config: DocumentAIConfig;
  private headers: TableStructure['headers'];

  constructor(config: DocumentAIConfig) {
    this.config = config;
    this.client = new DocumentProcessorServiceClient();
    this.headers = {
      pos: -1,
      quantity: -1,
      description: -1,
      unitPrice: -1,
      total: -1
    };
  }

  async processDocument(attachment: ProcessedAttachment): Promise<TableStructure> {
    try {
      // Convert content to buffer if it's base64 or get the raw buffer
      const buffer = Buffer.from(attachment.content, 'base64');

      // Process the document
      const [result] = await this.client.processDocument({
        name: `projects/${this.config.projectId}/locations/${this.config.location}/processors/${this.config.processorId}`,
        rawDocument: {
          content: buffer,
          mimeType: attachment.originalType
        }
      });

      const document = result.document as GoogleDocument;
      if (!document) {
        throw new Error('No document in response');
      }

      // Extract tables from the document
      const tables = document.pages?.flatMap((page: GooglePage) => page.tables || []) || [];
      
      // Process the first table (assuming invoice has one main table)
      const firstTable = tables[0];
      if (!firstTable) {
        throw new Error('No tables found in document');
      }

      // Convert Google's table format to our structure
      const tableStructure: TableStructure = {
        headers: this.detectHeaderColumns(firstTable),
        rows: this.processTableRows(firstTable)
      };

      return tableStructure;
    } catch (error) {
      console.error('Error processing document with Document AI:', error);
      throw error;
    }
  }

  private detectHeaderColumns(table: GoogleTable): TableStructure['headers'] {
    // Find header row (usually first row)
    const headerRow = table.headerRows?.[0] || table.bodyRows?.[0];
    if (!headerRow) {
      throw new Error('No header row found in table');
    }

    // Reset headers
    this.headers = {
      pos: -1,
      quantity: -1,
      description: -1,
      unitPrice: -1,
      total: -1
    };

    headerRow.cells?.forEach((cell: GoogleTableCell, index: number) => {
      const textContent = cell.layout?.textAnchor?.content?.toLowerCase() || '';
      
      if (textContent.includes('pos') || textContent.includes('position') || textContent.includes('nr')) {
        this.headers.pos = index;
      } else if (textContent.includes('qty') || textContent.includes('quantity') || textContent.includes('menge')) {
        this.headers.quantity = index;
      } else if (textContent.includes('description') || textContent.includes('item') || textContent.includes('dienst')) {
        this.headers.description = index;
      } else if (textContent.includes('price') || textContent.includes('rate') || textContent.includes('preis')) {
        this.headers.unitPrice = index;
      } else if (textContent.includes('total') || textContent.includes('amount') || textContent.includes('betrag')) {
        this.headers.total = index;
      }
    });

    return this.headers;
  }

  private processTableRows(table: GoogleTable): TableStructure['rows'] {
    // Skip header row and use body rows
    const dataRows = table.bodyRows || [];

    return dataRows.map((row: GoogleTableRow) => {
      const cells = (row.cells || []).map((cell: GoogleTableCell, colIndex: number): TableCell => ({
        content: cell.layout?.textAnchor?.content || '',
        rowIndex: Number(row.layout?.rowSpan) || 0,
        columnIndex: colIndex,
        confidence: Number(cell.layout?.confidence) || 1.0
      }));

      // Extract numeric values
      const rowData = {
        cells,
        position: this.extractNumber(cells[this.headers.pos]?.content),
        quantity: this.extractNumber(cells[this.headers.quantity]?.content),
        unitPrice: this.extractNumber(cells[this.headers.unitPrice]?.content),
        total: this.extractNumber(cells[this.headers.total]?.content)
      };

      // Validate quantity using total/unitPrice if needed
      if (!rowData.quantity && rowData.total && rowData.unitPrice) {
        rowData.quantity = rowData.total / rowData.unitPrice;
      }

      return rowData;
    });
  }

  private extractNumber(text: string): number | undefined {
    if (!text) return undefined;
    
    // Remove currency symbols and convert to number
    const cleaned = text.replace(/[^0-9.,]/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  }
} 