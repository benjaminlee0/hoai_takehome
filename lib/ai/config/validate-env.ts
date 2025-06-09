import { DocumentAIConfig } from '../types/document-ai';

export function validateDocumentAIEnv(): DocumentAIConfig {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us';
  const processorId = process.env.GOOGLE_CLOUD_PROCESSOR_ID;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  // Check required fields
  const missingFields: string[] = [];
  if (!projectId) missingFields.push('GOOGLE_CLOUD_PROJECT_ID');
  if (!processorId) missingFields.push('GOOGLE_CLOUD_PROCESSOR_ID');
  if (!credentials) missingFields.push('GOOGLE_APPLICATION_CREDENTIALS');

  if (missingFields.length > 0) {
    throw new Error(`Missing required Document AI environment variables: ${missingFields.join(', ')}`);
  }

  // At this point TypeScript knows these are not undefined
  return {
    projectId,
    location,
    processorId,
    credentials
  } as DocumentAIConfig;
} 