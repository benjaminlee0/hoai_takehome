/**
 * Constants for Document AI entity types based on the processor schema
 */
export const DOCUMENT_AI_ENTITIES = {
  // Main invoice fields
  TOTAL_AMOUNT: 'total-amount',
  TOTAL_TAX_AMOUNT: 'total-tax-amount',
  VENDOR_NAME: 'vendor-name',
  CUSTOMER_NAME: 'customer-name',
  INVOICE_NUMBER: 'invoice-number',
  INVOICE_DATE: 'invoice-date',
  DUE_DATE: 'due-date',
  CURRENCY: 'currency',

  // Line item fields
  LINE_ITEMS: {
    DESCRIPTION: 'line-items/description',
    QUANTITY: 'line-items/quantity',
    UNIT_PRICE: 'line-items/unit-price',
    TOTAL: 'line-items/amount',
    POSITION: 'line-items/position'
  },

  // VAT/Tax fields
  VAT: {
    AMOUNT: 'vat/amount',
    CATEGORY_CODE: 'vat/category-code',
    TAX_AMOUNT: 'vat/tax-amount',
    TAX_RATE: 'vat/tax-rate'
  }
} as const; 