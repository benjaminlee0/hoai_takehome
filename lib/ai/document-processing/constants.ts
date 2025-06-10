// Keywords that indicate user wants to process an invoice
export const userInvoiceIntentKeywords = [
  'invoice',
  'process invoice',
  'process this invoice',
  'extract invoice',
  'extract this invoice',
  'extract the invoice',
  'extract the invoice details',
  'extract the invoice information',
  'extract the invoice data',
];

// Invoice processing prompt
export const INVOICE_PROCESSING_PROMPT = `Analyze this document and determine if it's a business invoice.

A business invoice or business-style invoice should have most of these elements:
- Invoice number
- Issue date
- Billing period or Due date
- Line items or service charges with corresponding amounts (quantities and unit prices are optional)
- Total amount
- Vendor and customer information

In general, any document including the term "invoice" should be considered a business invoice, otherwise use your best judgement and try to avoid other financial documents like bills or receipts.

The document may be a PDF or image that's been converted to text, so the formatting might not be perfect. Look for these elements even if they're not perfectly formatted.

If this is NOT a business invoice:
1. Respond with exactly "false:" followed by a brief explanation
Example: "false: This appears to be a receipt rather than a business invoice."

Even if a document appears to be missing some information, if it looks like a business invoice, consider it a business invoice and move to the true case.

If this IS a business invoice:
1. Respond with exactly "true:" followed by the extracted data in strict JSON format
2. Do not include any additional text or explanations
3. The JSON must exactly match this structure:

{
  "vendor": "<vendor name as string>",
  "customer": "<customer name as string>",
  "invoice_number": "<invoice number as string>",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "currency": "<currency code as string, e.g. USD, EUR>",
  "total_amount": <total invoice amount as float>,
  "line_items": [
    {
      "description": "<item description as string>",
      "quantity": <integer>,
      "unit_price": <float>,
      "total": <float>
    }
  ]
}

CRITICAL REQUIREMENTS:
1. Dates MUST be in YYYY-MM-DD format (e.g. 2024-03-21)
2. Numbers must be floats without currency symbols or commas
3. The response must be parseable as valid JSON
4. Do not include any markdown formatting or additional text

IMPORTANT LINE ITEM RULES:
1. Consolidate identical items:
   - If multiple line items have the EXACT same description and unit price
   - Add their quantities together
   - Example: "Hamburger" × 2 at $5.39 and "Hamburger" × 3 at $5.39
     Should become one line item with quantity: 5, unit_price: 5.39
2. Keep unit prices consistent when consolidating items
3. Maintain original pricing - do not convert currencies
4. Do not include position/reference numbers as quantities

For PDFs and scanned documents:
- Look for invoice elements even if they're not in a standard format
- Do not consider addresses as part of vendor or customer names
- The text might have extra spaces or unusual line breaks; be careful of common mistakes like considering line numbers as item quantities
- Numbers might be split across lines
- Some fields might be missing - extract what you can find

Document text:`;