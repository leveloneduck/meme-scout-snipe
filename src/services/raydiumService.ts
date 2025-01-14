import { Connection, PublicKey, ParsedTransactionWithMeta, PartiallyDecodedInstruction, ParsedInstruction, ParsedInnerInstruction } from "@solana/web3.js";
import { LiquidityPoolKeysV4, MARKET_STATE_LAYOUT_V3, Market, TOKEN_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { Buffer } from 'buffer';

// Using Helius RPC endpoint as it's more reliable
const RPC_ENDPOINT = 'https://mainnet.helius-rpc.com/?api-key=7c0c047d-e3fd-44d0-961f-bd46d7f54533';
const RAYDIUM_POOL_V4_PROGRAM_ID = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";
const SERUM_OPENBOOK_PROGRAM_ID = 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_DECIMALS = 9;

// Add Buffer to window object
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

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
              console.log("New pool initialization detected:", logs.signature);

              const poolKeys = await this.fetchPoolKeys(logs.signature);
              console.log("Fetched pool keys:", poolKeys);
              
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
    console.log("Fetching pool keys for transaction:", signature);
    const tx = await this.connection.getParsedTransaction(signature, {maxSupportedTransactionVersion: 0});
    if (!tx) {
      throw new Error('Failed to fetch transaction with signature ' + signature);
    }

    const poolInfo = this.parsePoolInfoFromLpTransaction(tx);
    const marketInfo = await this.fetchMarketInfo(poolInfo.marketId);

    return {
      id: poolInfo.id,
      baseMint: poolInfo.baseMint,
      quoteMint: poolInfo.quoteMint,
      lpMint: poolInfo.lpMint,
      baseDecimals: poolInfo.baseDecimals,
      quoteDecimals: poolInfo.quoteDecimals,
      lpDecimals: poolInfo.lpDecimals,
      version: 4,
      programId: poolInfo.programId,
      authority: poolInfo.authority,
      openOrders: poolInfo.openOrders,
      targetOrders: poolInfo.targetOrders,
      baseVault: poolInfo.baseVault,
      quoteVault: poolInfo.quoteVault,
      withdrawQueue: poolInfo.withdrawQueue,
      lpVault: poolInfo.lpVault,
      marketVersion: 3,
      marketProgramId: poolInfo.marketProgramId,
      marketId: poolInfo.marketId,
      marketAuthority: Market.getAssociatedAuthority({
        programId: poolInfo.marketProgramId,
        marketId: poolInfo.marketId
      }).publicKey,
      marketBaseVault: marketInfo.baseVault,
      marketQuoteVault: marketInfo.quoteVault,
      marketBids: marketInfo.bids,
      marketAsks: marketInfo.asks,
      marketEventQueue: marketInfo.eventQueue,
      lookupTableAccount: null, // Add the missing property
    };
  }

  private async fetchMarketInfo(marketId: PublicKey) {
    const marketAccountInfo = await this.connection.getAccountInfo(marketId);
    if (!marketAccountInfo) {
      throw new Error('Failed to fetch market info for market id ' + marketId.toBase58());
    }
    return MARKET_STATE_LAYOUT_V3.decode(marketAccountInfo.data);
  }

  private parsePoolInfoFromLpTransaction(txData: ParsedTransactionWithMeta) {
    const initInstruction = this.findInstructionByProgramId(
      txData.transaction.message.instructions,
      new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID)
    ) as PartiallyDecodedInstruction;

    if (!initInstruction) {
      throw new Error('Failed to find lp init instruction in lp init tx');
    }

    const baseMint = initInstruction.accounts[8];
    const baseVault = initInstruction.accounts[10];
    const quoteMint = initInstruction.accounts[9];
    const quoteVault = initInstruction.accounts[11];
    const lpMint = initInstruction.accounts[7];
    const baseAndQuoteSwapped = baseMint.toBase58() === SOL_MINT;

    const lpMintInitInstruction = this.findInitializeMintInInnerInstructions(
      txData.meta?.innerInstructions ?? [],
      lpMint
    );

    if (!lpMintInitInstruction) {
      throw new Error('Failed to find lp mint init instruction in lp init tx');
    }

    const lpMintInstruction = this.findMintToInInnerInstructions(
      txData.meta?.innerInstructions ?? [],
      lpMint
    );

    if (!lpMintInstruction) {
      throw new Error('Failed to find lp mint to instruction in lp init tx');
    }

    const baseTransferInstruction = this.findTransferInstructionInInnerInstructions(
      txData.meta?.innerInstructions ?? [],
      baseVault,
      TOKEN_PROGRAM_ID
    );

    if (!baseTransferInstruction) {
      throw new Error('Failed to find base transfer instruction in lp init tx');
    }

    const quoteTransferInstruction = this.findTransferInstructionInInnerInstructions(
      txData.meta?.innerInstructions ?? [],
      quoteVault,
      TOKEN_PROGRAM_ID
    );

    if (!quoteTransferInstruction) {
      throw new Error('Failed to find quote transfer instruction in lp init tx');
    }

    const lpDecimals = lpMintInitInstruction.parsed.info.decimals;
    const basePreBalance = (txData.meta?.preTokenBalances ?? []).find(
      balance => balance.mint === baseMint.toBase58()
    );

    if (!basePreBalance) {
      throw new Error('Failed to find base tokens preTokenBalance entry');
    }

    const baseDecimals = basePreBalance.uiTokenAmount.decimals;

    return {
      id: initInstruction.accounts[4],
      baseMint,
      quoteMint,
      lpMint,
      baseDecimals: baseAndQuoteSwapped ? SOL_DECIMALS : baseDecimals,
      quoteDecimals: baseAndQuoteSwapped ? baseDecimals : SOL_DECIMALS,
      lpDecimals,
      version: 4,
      programId: new PublicKey(RAYDIUM_POOL_V4_PROGRAM_ID),
      authority: initInstruction.accounts[5],
      openOrders: initInstruction.accounts[6],
      targetOrders: initInstruction.accounts[13],
      baseVault,
      quoteVault,
      withdrawQueue: new PublicKey("11111111111111111111111111111111"),
      lpVault: new PublicKey(lpMintInstruction.parsed.info.account),
      marketVersion: 3,
      marketProgramId: initInstruction.accounts[15],
      marketId: initInstruction.accounts[16],
    };
  }

  private findTransferInstructionInInnerInstructions(
    innerInstructions: ParsedInnerInstruction[],
    destinationAccount: PublicKey,
    programId?: PublicKey
  ): ParsedInstruction | null {
    for (const innerInstruction of innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        const parsedInstruction = instruction as ParsedInstruction;
        if (!parsedInstruction.parsed) continue;
        if (
          parsedInstruction.parsed.type === 'transfer' &&
          parsedInstruction.parsed.info.destination === destinationAccount.toBase58() &&
          (!programId || parsedInstruction.programId.equals(programId))
        ) {
          return parsedInstruction;
        }
      }
    }
    return null;
  }

  private findInitializeMintInInnerInstructions(
    innerInstructions: ParsedInnerInstruction[],
    mintAddress: PublicKey
  ): ParsedInstruction | null {
    for (const innerInstruction of innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        const parsedInstruction = instruction as ParsedInstruction;
        if (!parsedInstruction.parsed) continue;
        if (
          parsedInstruction.parsed.type === 'initializeMint' &&
          parsedInstruction.parsed.info.mint === mintAddress.toBase58()
        ) {
          return parsedInstruction;
        }
      }
    }
    return null;
  }

  private findMintToInInnerInstructions(
    innerInstructions: ParsedInnerInstruction[],
    mintAddress: PublicKey
  ): ParsedInstruction | null {
    for (const innerInstruction of innerInstructions) {
      for (const instruction of innerInstruction.instructions) {
        const parsedInstruction = instruction as ParsedInstruction;
        if (!parsedInstruction.parsed) continue;
        if (
          parsedInstruction.parsed.type === 'mintTo' &&
          parsedInstruction.parsed.info.mint === mintAddress.toBase58()
        ) {
          return parsedInstruction;
        }
      }
    }
    return null;
  }

  private findInstructionByProgramId(
    instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>,
    programId: PublicKey
  ): ParsedInstruction | PartiallyDecodedInstruction | null {
    for (const instruction of instructions) {
      if (instruction.programId.equals(programId)) {
        return instruction;
      }
    }
    return null;
  }
}
