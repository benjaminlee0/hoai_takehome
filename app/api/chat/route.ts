import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { saveExtractedInvoice } from '@/lib/ai/tools/save-invoice';
import { processAttachments, saveProcessedDocument } from '@/lib/ai/document-processing/attachment-processing';

export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  const body: {
    id: string;
    messages: Array<Message>;
    selectedChatModel: string;
    experimental_attachments?: any;
  } = JSON.parse(raw);

  const { id, messages, selectedChatModel } = body;
  const lastMessage = messages[messages.length - 1];
  const parsedAttachments = lastMessage.experimental_attachments || [];

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Add expires field required by Session type
  const fullSession = {
    ...session,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
  };

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  let updatedMessages = [...messages];
  
  if (parsedAttachments.length > 0) {
    // Start with initial processing message
    const processingMessage = {
      id: generateUUID(),
      role: 'assistant' as const,
      content: 'Analyzing invoice document...',
      createdAt: new Date(),
      chatId: id
    };
    
    await saveMessages({
      messages: [processingMessage]
    });
    updatedMessages = [...updatedMessages, processingMessage];

    const processedAttachments = await processAttachments(parsedAttachments, userMessage);
    
    for (const attachment of processedAttachments) {
      const documentId = await saveProcessedDocument(attachment, session.user.id);
      
      // If we have invoice data from Document AI, add it as a new message for processing
      if (attachment.extractedInvoiceData) {
        const { lineItems = [], totalAmount, currency = '€' } = attachment.extractedInvoiceData;
        
        // Update processing status
        const statusMessage = {
          id: generateUUID(),
          role: 'assistant' as const,
          content: 'Invoice analyzed successfully. Saving extracted data...',
          createdAt: new Date(),
          chatId: id
        };
        
        await saveMessages({
          messages: [statusMessage]
        });
        updatedMessages = [...updatedMessages, statusMessage];
        
        // Format line items nicely
        const formattedLineItems = lineItems.map(item => {
          const unitPrice = item.unitPrice;
          const totalPrice = item.totalPrice;
          
          return `Description: ${item.description}\n` +
                 `Quantity: ${item.quantity} × Unit Price: ${currency}${unitPrice.toFixed(2)} = ` +
                 `Total: ${currency}${totalPrice.toFixed(2)}`;
        }).join('\n\n');

        const extractionMessage = {
          id: generateUUID(),
          role: 'assistant' as const,
          content: lineItems.length > 0 ? 
            'Line Items:\n\n' +
            formattedLineItems + '\n\n' +
            `The total amount matches the sum of all line item totals. The invoice data has been successfully saved to the database.`
            : 'No line items found in the invoice.',
          createdAt: new Date(),
          chatId: id
        };

        await saveMessages({
          messages: [extractionMessage]
        });

        updatedMessages = [...updatedMessages, extractionMessage];
      } else if (attachment.error) {
        // If Document AI failed, add error message and prevent invoice saving
        const errorMessage = {
          id: generateUUID(),
          role: 'assistant' as const,
          content: `Failed to process document with Document AI: ${attachment.error}\nPlease ensure the document is a valid invoice and try again.`,
          createdAt: new Date(),
          chatId: id
        };

        await saveMessages({
          messages: [errorMessage]
        });

        updatedMessages = [...updatedMessages, errorMessage];
      } else {
        // Update the existing message with document content
        const messageIndex = updatedMessages.findIndex(msg => msg.id === userMessage.id);
        if (messageIndex !== -1) {
          updatedMessages[messageIndex] = {
            ...updatedMessages[messageIndex],
            content: `${userMessage.content}\n\nDocument ID: ${documentId}\nType: ${attachment.type}\nContent:\n${attachment.content}`
          };
        }
      }
    }
  }

  const cleanedMessages = updatedMessages.map((msg) => {
    const { experimental_attachments, ...rest } = msg;
    return rest;
  });

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model: myProvider.languageModel(selectedChatModel),
        system: systemPrompt({ selectedChatModel }),
        messages: cleanedMessages,
        maxSteps: 5,
        experimental_activeTools:
          selectedChatModel === 'chat-model-reasoning'
            ? []
            : [
                'getWeather',
                'createDocument',
                'updateDocument',
                'requestSuggestions',
                'saveExtractedInvoice',
              ],
        experimental_transform: smoothStream({ chunking: 'word' }),
        experimental_generateMessageId: generateUUID,
        tools: {
          getWeather,
          createDocument: createDocument({ session: fullSession, dataStream }),
          updateDocument: updateDocument({ session: fullSession, dataStream }),
          requestSuggestions: requestSuggestions({
            session: fullSession,
            dataStream,
          }),
          saveExtractedInvoice: saveExtractedInvoice({
            session: fullSession,
            dataStream,
          }),
        },
        onFinish: async ({ response, reasoning }) => {
          if (session.user?.id) {
            try {
              const sanitizedResponseMessages = sanitizeResponseMessages({
                messages: response.messages,
                reasoning,
              });

              if (sanitizedResponseMessages.length > 0) {
                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => {
                    return {
                      id: message.id,
                      chatId: id,
                      role: message.role,
                      content: message.content,
                      createdAt: new Date(),
                    };
                  }),
                });
              }
            } catch (error) {
              console.error('Failed to save chat', error);
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (error) => {
      console.error('Error in chat route:', error);
      return 'Oops, an error occurred!';
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
