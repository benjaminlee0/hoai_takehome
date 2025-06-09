import { Message } from 'ai';
import { myProvider } from '@/lib/ai/models';
import { createDataStreamResponse, streamText, smoothStream } from 'ai';

const INVOICE_DETECTION_PROMPT = `You are an expert at identifying business invoices in any language. Analyze the provided document and user message.

A business invoice, regardless of language, should have these universal elements:
- Business information (seller and buyer details)
- Line items with associated pricing
- Payment information and dates
- A unique invoice identifier/number
- Itemized costs and total amount

The document should follow a clear invoice structure, even if the text is not in English.
Focus on the document's structure and numerical patterns rather than specific keywords.

CRITICAL: You must respond with ONLY one of these two words:
"true" - if this is a business invoice AND the user wants to process it
"false" - for any other case

Do not add any other text.
Do not say "Successful" or any other words.
Do not add punctuation or spaces.
ONLY respond with "true" or "false".`;

export class InvoiceVerificationService {
  /**
   * Use LLM to determine if a document is an invoice and if user wants to process it
   */
  async verifyInvoice(content: string, userMessage: Message): Promise<boolean> {
    try {
      if (!content || content.length < 10) {
        console.warn('Document content too short for invoice detection:', content);
        return false;
      }

      console.log('Analyzing document and user intent...');
      console.log('Sending content to LLM for invoice detection. Content length:', content.length);

      let result = false;

      await createDataStreamResponse({
        execute: (dataStream) => {
          const streamResult = streamText({
            model: myProvider.languageModel('chat-model-large'),
            messages: [
              { 
                role: 'system', 
                content: INVOICE_DETECTION_PROMPT
              },
              { 
                role: 'user', 
                content: `User message: ${userMessage.content}\n\nDocument content:\n${content}`
              }
            ],
            experimental_transform: smoothStream({ chunking: 'word' }),
            onFinish: ({ response }) => {
              // Only accept exact "true" or "false" responses
              const lastMessage = response.messages[response.messages.length - 1];
              if (lastMessage && typeof lastMessage.content === 'string') {
                const text = lastMessage.content.trim().toLowerCase();
                if (text === 'true' || text === 'false') {
                  result = text === 'true';
                }
              }
            }
          });

          streamResult.mergeIntoDataStream(dataStream);
        },
        onError: (error) => {
          console.error('Error in invoice detection:', error);
          return 'false';
        },
      });

      return result;
    } catch (err) {
      console.error('Failed to check document type:', err);
      return false;
    }
  }
} 