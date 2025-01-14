import { Connection, PublicKey } from "@solana/web3.js";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";

// Using Helius RPC endpoint as it's more reliable
// const RPC_ENDPOINT = "https://rpc-mainnet.helius.xyz/?api-key=7c0c047d-e3fd-44d0-961f-bd46d7f54533";
const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=7c0c047d-e3fd-44d0-961f-bd46d7f54533';
const RAYDIUM_POOL_V4_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

export interface PoolInfo {
  address: string;
  baseMint: string;
  quoteMint: string;
  timestamp: number;
  baseDecimals: number;
  quoteDecimals: number;
}

export class RaydiumService {
  private connection: Connection;
  private seenTransactions: Set<string>;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor() {
    this.connection = new Connection(RPC_ENDPOINT, {
      wsEndpoint: RPC_ENDPOINT.replace('https', 'wss'),
      commitment: 'confirmed'
    });
    this.seenTransactions = new Set();
  }

  subscribeToNewPools(callback: (poolInfo: PoolInfo) => void) {
    const setupSubscription = () => {
      try {
        console.log("Setting up Raydium pool subscription...");
        
        this.connection.onLogs(
          new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID),
          async (logs) => {
            if (this.seenTransactions.has(logs.signature)) return;
            this.seenTransactions.add(logs.signature);

            try {
              if (!logs.logs.some((log) => log.includes("init_pc_amount"))) return;

              const poolKeys = await this.fetchPoolKeys(logs.signature);
              
              callback({
                address: poolKeys.id.toString(),
                baseMint: poolKeys.baseMint.toString(),
                quoteMint: poolKeys.quoteMint.toString(),
                timestamp: Date.now(),
                baseDecimals: poolKeys.baseDecimals,
                quoteDecimals: poolKeys.quoteDecimals,
              });
            } catch (error) {
              console.error("Error processing pool:", error);
            }
          },
          'confirmed'
        );

        // Reset reconnect attempts on successful connection
        this.reconnectAttempts = 0;
        console.log("Successfully subscribed to Raydium pools");
      } catch (error) {
        console.error("Error setting up subscription:", error);
        this.handleReconnect(setupSubscription);
      }
    };

    setupSubscription();
  }

  private handleReconnect(setupSubscription: () => void) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      console.log(`Attempting to reconnect in ${delay/1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connection = new Connection(RPC_ENDPOINT, {
          wsEndpoint: RPC_ENDPOINT.replace('https', 'wss'),
          commitment: 'confirmed'
        });
        setupSubscription();
      }, delay);
    } else {
      console.error("Max reconnection attempts reached. Please check your connection or try again later.");
    }
  }

  private async fetchPoolKeys(signature: string): Promise<LiquidityPoolKeysV4> {
    // This is a simplified version - you'll need to implement the full pool key fetching logic
    // from your provided script here
    throw new Error("Not implemented");
  }
}
