'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDownIcon } from '@/components/icons';

interface TokenStats {
  cost: {
    averageCost: string;
    totalInvoices: number;
    totalCost: string;
  };
  savings: {
    tokensSaved: number;
    totalCaches: number;
    totalUses: number;
    cacheHits: number;
    hitRate: number;
    estimatedCostSaved: string;
  };
}

export default function StatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        console.log('UI - Fetching stats...');
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await response.json();
        console.log('UI - Received stats data:', data);
        setStats(data);
      } catch (err) {
        console.error('UI - Error fetching stats:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    const intervalId = setInterval(fetchStats, 5000); // Refresh every 5 seconds
    fetchStats(); // Initial fetch

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    console.log('UI - Current stats state:', stats);
  }, [stats]);

  if (loading) {
    return <div className="p-8">Loading statistics...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>;
  }

  if (!stats) {
    return <div className="p-8">No statistics available</div>;
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2"
          onClick={() => router.back()}
        >
          <div className="rotate-90">
            <ChevronDownIcon size={16} />
          </div>
          Back
        </Button>
        <h1 className="text-2xl font-bold">Token Usage Statistics</h1>
      </div>
      
      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cost Metrics</CardTitle>
            <CardDescription>Invoice processing costs and averages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Average Cost per Invoice</p>
              <p className="text-2xl font-bold">${stats.cost.averageCost}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Total Invoices Processed</p>
              <p className="text-2xl font-bold">{stats.cost.totalInvoices}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Total Processing Cost</p>
              <p className="text-2xl font-bold">${stats.cost.totalCost}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cache Performance</CardTitle>
            <CardDescription>Savings from prompt caching</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Tokens Saved</p>
              <p className="text-2xl font-bold">{stats.savings.tokensSaved.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Cache Hit Rate</p>
              <p className="text-2xl font-bold">
                {`${stats.savings.hitRate.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Cost Saved</p>
              <p className="text-2xl font-bold">${stats.savings.estimatedCostSaved}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        <p>* Costs are calculated based on GPT-4 pricing ($0.03/1K prompt tokens, $0.06/1K completion tokens)</p>
      </div>
    </div>
  );
} 