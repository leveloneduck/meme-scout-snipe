import { formatDistanceToNow } from "date-fns";
import { PoolInfo } from "@/services/raydiumService";

interface PoolCardProps {
  pool: PoolInfo;
}

export const PoolCard = ({ pool }: PoolCardProps) => {
  return (
    <div className="bg-card p-4 rounded-lg shadow-lg animate-fade-in">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">New Pool Created</h3>
          <p className="text-sm text-muted-foreground">
            {formatDistanceToNow(pool.timestamp, { addSuffix: true })}
          </p>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pool Address</span>
          <span className="text-white font-mono text-sm">{pool.address.slice(0, 8)}...{pool.address.slice(-8)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Base Token</span>
          <span className="text-white font-mono text-sm">{pool.baseMint.slice(0, 8)}...{pool.baseMint.slice(-8)}</span>
        </div>
        
        <div className="flex justify-between">
          <span className="text-muted-foreground">Quote Token</span>
          <span className="text-white font-mono text-sm">{pool.quoteMint.slice(0, 8)}...{pool.quoteMint.slice(-8)}</span>
        </div>
      </div>
    </div>
  );
};