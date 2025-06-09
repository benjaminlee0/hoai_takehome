import { auth } from '@/app/(auth)/auth';
import { getAverageInvoiceCost, getTokenSavingsMetrics } from '@/lib/ai/token-tracking';

export async function GET() {
  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const [costMetrics, savingsMetrics] = await Promise.all([
      getAverageInvoiceCost(),
      getTokenSavingsMetrics()
    ]);

    return Response.json({
      cost: {
        averageCost: costMetrics.averageCost.toFixed(4),
        totalInvoices: costMetrics.totalInvoices,
        totalCost: costMetrics.totalCost.toFixed(4),
      },
      savings: {
        tokensSaved: savingsMetrics.tokensSaved,
        totalCaches: savingsMetrics.totalCaches,
        totalReuse: savingsMetrics.totalReuse,
        estimatedCostSaved: savingsMetrics.estimatedCostSaved.toFixed(4),
      }
    });
  } catch (error) {
    console.error('Error fetching token usage stats:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 