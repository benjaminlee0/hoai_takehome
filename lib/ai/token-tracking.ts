import { db } from '@/lib/db';
import { tokenUsage, promptCache } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { Attachment } from '@/lib/types';

// Cost per 1K tokens (based on GPT-4 pricing)
const PROMPT_TOKEN_COST = 0.03 / 1000;    // $0.03 per 1K tokens
const COMPLETION_TOKEN_COST = 0.06 / 1000; // $0.06 per 1K tokens

interface TokenUsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function trackTokenUsage(id: string, usage: TokenUsageData) {
  try {
    const estimatedCost = 
      (usage.promptTokens * PROMPT_TOKEN_COST) + 
      (usage.completionTokens * COMPLETION_TOKEN_COST);

    await db.insert(tokenUsage).values({
      id,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCost,
      createdAt: new Date(),
    });

    return estimatedCost;
  } catch (error) {
    console.error('Failed to track token usage:', error);
    return null;
  }
}

export async function getAverageInvoiceCost() {
  const result = await db
    .select({
      avgCost: sql<number>`CAST(AVG(${tokenUsage.estimatedCost}) AS FLOAT)`,
      totalInvoices: sql<number>`COUNT(${tokenUsage.id})`,
      totalCost: sql<number>`CAST(SUM(${tokenUsage.estimatedCost}) AS FLOAT)`,
    })
    .from(tokenUsage)
    .get();

  return {
    averageCost: result?.avgCost || 0,
    totalInvoices: result?.totalInvoices || 0,
    totalCost: result?.totalCost || 0,
  };
}

export async function getTokenSavingsMetrics() {
  const result = await db
    .select({
      totalTokensSaved: sql<number>`CAST(SUM(${promptCache.tokenCount} * (${promptCache.useCount} - 1)) AS INTEGER)`,
      totalCaches: sql<number>`COUNT(${promptCache.id})`,
      totalReuseCount: sql<number>`CAST(SUM(${promptCache.useCount}) AS INTEGER)`,
    })
    .from(promptCache)
    .get();

  const estimatedCostSaved = 
    ((result?.totalTokensSaved || 0) * PROMPT_TOKEN_COST);

  return {
    tokensSaved: result?.totalTokensSaved || 0,
    totalCaches: result?.totalCaches || 0,
    totalReuse: result?.totalReuseCount || 0,
    estimatedCostSaved,
  };
}

function createCacheKey(prompt: string, attachments?: Attachment[]) {
  // Create a composite key that includes both prompt and attachment information
  const attachmentKey = attachments?.map(a => `${a.id}:${a.contentType}`).sort().join('|') || '';
  const compositeKey = `${prompt}|||${attachmentKey}`;
  return createHash('sha256').update(compositeKey).digest('hex');
}

export async function getCachedPrompt(prompt: string, attachments?: Attachment[]) {
  const hash = createCacheKey(prompt, attachments);
  
  const cached = await db
    .select()
    .from(promptCache)
    .where(eq(promptCache.hash, hash))
    .get();

  if (cached) {
    // Update usage statistics
    await db.update(promptCache)
      .set({ 
        useCount: cached.useCount + 1,
        lastUsedAt: new Date()
      })
      .where(eq(promptCache.id, cached.id))
      .run();
  }

  return cached;
}

export async function cachePrompt(prompt: string, tokenCount: number, attachments?: Attachment[]) {
  const hash = createCacheKey(prompt, attachments);
  
  // Check if already exists
  const existing = await db
    .select()
    .from(promptCache)
    .where(eq(promptCache.hash, hash))
    .get();

  if (existing) {
    return existing;
  }

  // Create new cache entry
  const now = new Date();
  const cacheEntry = {
    id: generateUUID(),
    prompt,
    hash,
    tokenCount,
    createdAt: now,
    lastUsedAt: now,
    useCount: 1,
  };

  await db.insert(promptCache)
    .values(cacheEntry)
    .run();

  return cacheEntry;
} 