import {
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import { trackTokenUsage } from '@/lib/ai/token-tracking';
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
  convertToTextParts,
  convertToAIMessage,
} from '@/lib/utils';
import { Message } from '@/lib/types';

import { generateTitleFromUserMessage } from '../../(chat)/actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { saveExtractedInvoice } from '@/lib/ai/tools/save-invoice';
import { 
  processAttachments, 
  saveProcessedDocument 
} from '@/lib/ai/document-processing/attachment-processing';
import { 
  formatDocumentContent
} from '@/lib/ai/document-processing/invoice-processing';

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

  console.log('Received attachments:', JSON.stringify(parsedAttachments, null, 2));

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  // Format user message content as text parts
  const formattedUserMessage = {
    ...userMessage,
    content: convertToTextParts(userMessage.content),
    createdAt: new Date(),
    chatId: id
  };

  await saveMessages({
    messages: [formattedUserMessage],
  });

  let updatedMessages = [...messages];
  
  if (parsedAttachments.length > 0) {
    // Log the structure of each attachment
    parsedAttachments.forEach((att, i) => {
      console.log(`Attachment ${i} structure:`, {
        id: att.id,
        contentType: att.contentType,
        name: att.name,
        size: att.size,
        hasContent: !!att.content,
        contentStart: att.content ? att.content.substring(0, 50) + '...' : 'no content'
      });
    });

    const processedAttachments = await processAttachments(parsedAttachments, userMessage);
    
    for (const attachment of processedAttachments) {
      const documentId = await saveProcessedDocument(attachment, session.user.id);

      // Only create document message if we actually saved the document or if it's a non-invoice
      const documentMessage = {
        id: generateUUID(),
        role: 'assistant' as const,
        content: attachment.content,
        createdAt: new Date(),
        chatId: id,
        ...(documentId && { documentId }) // Only include documentId if we saved the document
      };

      await saveMessages({
        messages: [documentMessage]
      });

      updatedMessages = [...updatedMessages, documentMessage];
    }
  }

  const cleanedMessages = updatedMessages.map((msg) => {
    const { experimental_attachments, ...rest } = msg;
    return convertToAIMessage(rest);
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
        onFinish: async ({ usage }) => {
          if (session.user?.id && usage) {
            try {
              await trackTokenUsage(generateUUID(), usage);
            } catch (error) {
              console.error('Failed to track token usage:', error);
            }
          }
        },
        tools: {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({
            session,
            dataStream,
          }),
          saveExtractedInvoice: saveExtractedInvoice({
            session,
            dataStream,
          }),
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
