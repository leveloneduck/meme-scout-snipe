import { useEffect, useState } from "react";
import { RaydiumService, PoolInfo } from "@/services/raydiumService";
import { PoolCard } from "@/components/PoolCard";

const Index = () => {
  const [pools, setPools] = useState<PoolInfo[]>([]);
  
  useEffect(() => {
    const service = new RaydiumService();
    
    service.subscribeToNewPools((poolInfo) => {
      setPools((currentPools) => [poolInfo, ...currentPools].slice(0, 50)); // Keep last 50 pools
    });
    
    console.log("Started monitoring Raydium pools...");
  }, []);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Raydium Pool Sniper</h1>
          <p className="text-muted-foreground">Monitoring new pool creation in real-time</p>
        </header>

        <div className="space-y-4">
          {pools.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              Waiting for new pools...
            </div>
          ) : (
            pools.map((pool) => (
              <PoolCard key={pool.address} pool={pool} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;