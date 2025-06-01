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

export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  console.log('📦 Raw request body:', raw);

  const body: {
    id: string;
    messages: Array<Message>;
    selectedChatModel: string;
    experimental_attachments?: any;
  } = JSON.parse(raw);

  const { id, messages, selectedChatModel } = body;
  const lastMessage = messages[messages.length - 1];
  const parsedAttachments = lastMessage.experimental_attachments || [];

  console.log('📎 Attachments:', parsedAttachments);

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

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // 🧾 PDF processing from base64-encoded attachments
  const pdf = (await import('pdf-parse')).default;

  const pdfTexts = await Promise.all(
    parsedAttachments
      .filter((att: any) => att.contentType === 'application/pdf')
      .map(async (att: any) => {
        try {
          const base64 = att.url.split(',')[1];
          const buffer = Buffer.from(base64, 'base64');
          const data = await pdf(buffer);
          return data.text.trim();
        } catch (err) {
          console.error('❌ Failed to parse base64 PDF:', err);
          return null;
        }
      })
  );

  const combinedPDFText = pdfTexts.filter(Boolean).join('\n\n');

  if (combinedPDFText) {
    userMessage.content += `\n\nExtract the following fields from this invoice:\n` +
      `- Vendor Name\n` +
      `- Customer Name\n` +
      `- Invoice Number\n` +
      `- Invoice Date\n` +
      `- Due Date\n` +
      `- Total Amount\n` +
      `- Line Items\n\n` +
      `Invoice text:\n${combinedPDFText}`;
  }

  // const userMessageIndex = messages.findIndex((msg) => msg.id === userMessage.id);

  const cleanedMessages = messages.map((msg) => {
  const { experimental_attachments, ...rest } = msg;

  // Replace content for the modified message (e.g. with extracted invoice text)
  if (msg.id === userMessage.id) {
    return {
      ...rest,
      content: userMessage.content,
    };
  }

  // Strip attachments from all other messages
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
              ],
        experimental_transform: smoothStream({ chunking: 'word' }),
        experimental_generateMessageId: generateUUID,
        tools: {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({
            session,
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
            } catch (error) {
              console.error('Failed to save chat');
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
      console.log(error);
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
