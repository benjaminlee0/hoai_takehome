import { db } from '@/lib/db';
import { tokenUsage, promptCache } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { eq, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { Attachment } from '@/lib/types';

// Cost per 1K tokens (based on GPT-4 pricing)
const PROMPT_TOKEN_COST = 0.03 / 1000;    // $0.03 per 1K tokens
const COMPLETION_TOKEN_COST = 0.06 / 1000; // $0.06 per 1K tokens

// Special ID for the global stats row
const GLOBAL_STATS_ID = 'global-stats';

interface TokenUsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Synchronous function to ensure global stats row exists
function ensureGlobalStatsRowSync() {
  const globalStats = db
    .select()
    .from(tokenUsage)
    .where(eq(tokenUsage.id, GLOBAL_STATS_ID))
    .get();

  if (!globalStats) {
    // Create the global stats row with initial count
    const initialCount = db
      .select({ count: sql<number>`COUNT(DISTINCT ${tokenUsage.invoiceId})` })
      .from(tokenUsage)
      .where(sql`${tokenUsage.invoiceId} IS NOT NULL`)
      .get();

    db.insert(tokenUsage).values({
      id: GLOBAL_STATS_ID,
      createdAt: new Date(),
      totalProcessedInvoices: initialCount?.count || 0
    }).run();
  }
}

export async function trackTokenUsage(id: string, usage: TokenUsageData, invoiceId?: string) {
  try {
    const estimatedCost = 
      (usage.promptTokens * PROMPT_TOKEN_COST) + 
      (usage.completionTokens * COMPLETION_TOKEN_COST);

    // Ensure global stats row exists before transaction
    ensureGlobalStatsRowSync();

    // Use a synchronous transaction
    db.transaction(() => {
      // Insert the token usage record
      db.insert(tokenUsage).values({
      id,
        invoiceId: invoiceId || null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCost,
      createdAt: new Date(),
      }).run();

      // If this is for an invoice, increment the global counter
      if (invoiceId) {
        db.update(tokenUsage)
          .set({
            totalProcessedInvoices: sql`COALESCE(totalProcessedInvoices, 0) + 1`
          })
          .where(eq(tokenUsage.id, GLOBAL_STATS_ID))
          .run();
      }
    });

    return estimatedCost;
  } catch (error) {
    console.error('Failed to track token usage:', error);
    return null;
  }
}

export async function getAverageInvoiceCost() {
  // Ensure global stats row exists
  await ensureGlobalStatsRowSync();

  // Get the global stats and cost metrics in parallel
  const [globalStats, costMetrics] = await Promise.all([
    db
      .select({ totalInvoices: sql`COALESCE(\`totalProcessedInvoices\`, 0)` })
      .from(tokenUsage)
      .where(eq(tokenUsage.id, GLOBAL_STATS_ID))
      .get(),
    
    db
    .select({
      avgCost: sql<number>`CAST(AVG(${tokenUsage.estimatedCost}) AS FLOAT)`,
      totalCost: sql<number>`CAST(SUM(${tokenUsage.estimatedCost}) AS FLOAT)`,
    })
    .from(tokenUsage)
      .where(sql`${tokenUsage.id} != ${GLOBAL_STATS_ID}`)  // Exclude the global stats row from cost calculations
      .get()
  ]);

  return {
    averageCost: costMetrics?.avgCost || 0,
    totalInvoices: globalStats?.totalInvoices || 0,
    totalCost: costMetrics?.totalCost || 0,
  };
}

export async function getTokenSavingsMetrics() {
  const result = await db
    .select({
      totalTokensSaved: sql<number>`CAST(SUM(${promptCache.tokenCount} * (${promptCache.useCount} - 1)) AS INTEGER)`,
      totalCaches: sql<number>`COUNT(${promptCache.id})`,
      totalUses: sql<number>`CAST(SUM(${promptCache.useCount}) AS INTEGER)`,
    })
    .from(promptCache)
    .get();

  console.log('Cache metrics:', result);

  const totalTokensSaved = result?.totalTokensSaved || 0;
  const totalCaches = result?.totalCaches || 0;
  const totalUses = result?.totalUses || 0;
  const cacheHits = totalUses - totalCaches;
  const hitRate = totalUses > 0 ? (cacheHits / totalUses) * 100 : 0;
  const estimatedCostSaved = totalTokensSaved * PROMPT_TOKEN_COST;

  return {
    tokensSaved: totalTokensSaved,
    totalCaches,
    totalUses,
    cacheHits,
    hitRate,
    estimatedCostSaved,
  };
}

function createCacheKey(prompt: string) {
  return createHash('sha256').update(prompt).digest('hex');
}

export async function getCachedPrompt(prompt: string) {
  const hash = createCacheKey(prompt);
  console.log('Looking up cache with hash:', hash);
  
  const cached = await db
    .select()
    .from(promptCache)
    .where(eq(promptCache.hash, hash))
    .get();

  if (cached) {
    console.log('Cache hit:', cached);
    // Update usage statistics
    await db.update(promptCache)
      .set({ 
        useCount: cached.useCount + 1,
        lastUsedAt: new Date()
      })
      .where(eq(promptCache.id, cached.id))
      .run();

    // Track token usage for the cached prompt
    await trackTokenUsage(generateUUID(), {
      promptTokens: cached.tokenCount,
      completionTokens: 0, // No completion tokens for cached prompts
      totalTokens: cached.tokenCount,
    });
  } else {
    console.log('Cache miss');
  }

  return cached;
}

export async function cachePrompt(prompt: string, tokenCount: number) {
  const hash = createCacheKey(prompt);
  console.log('Caching prompt with hash:', hash);
  
  // Check if already exists
  const existing = await db
    .select()
    .from(promptCache)
    .where(eq(promptCache.hash, hash))
    .get();

  if (existing) {
    console.log('Prompt already cached, updating usage count:', existing);
    // Update the existing cache entry
    await db.update(promptCache)
      .set({ 
        useCount: existing.useCount + 1,
        lastUsedAt: new Date()
      })
      .where(eq(promptCache.id, existing.id))
      .run();
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

  console.log('Creating new cache entry:', cacheEntry);
  await db.insert(promptCache)
    .values(cacheEntry)
    .run();

  return cacheEntry;
} 