/*
 * Copyright (c) 2026 Talon Contributors
 * Author: dark.lijin@gmail.com
 * Licensed under the Talon Community Dual License Agreement.
 * See the LICENSE file in the project root for full license information.
 */
/** Talon Node.js SDK 类型声明。 */

export class TalonError extends Error {}

export class Talon {
  constructor(dbPath: string, libPath?: string);
  close(): void;
  persist(): void;
  stats(): Record<string, any>;

  // SQL
  sql(query: string): any[][];

  // KV
  kvSet(key: string, value: string, ttl?: number): void;
  kvGet(key: string): string | null;
  kvDel(key: string): boolean;
  kvExists(key: string): boolean;
  kvIncr(key: string): number;
  kvKeys(prefix?: string): string[];
  kvMset(keys: string[], values: string[]): void;
  kvMget(keys: string[]): (string | null)[];
  kvKeysMatch(pattern: string): string[];
  kvExpire(key: string, seconds: number): void;
  kvTtl(key: string): number | null;

  // TS
  tsCreate(name: string, tags?: string[], fields?: string[]): void;
  tsInsert(name: string, point: Record<string, any>): void;
  tsQuery(name: string, opts?: Record<string, any>): Record<string, any>[];
  tsAggregate(name: string, field: string, func: string, opts?: Record<string, any>): Record<string, any>[];
  tsSetRetention(name: string, retentionMs: number): void;
  tsPurgeExpired(name: string): number;
  tsPurgeByTag(name: string, tagFilters: [string, string][]): number;

  // MQ
  mqCreate(topic: string, maxLen?: number): void;
  mqPublish(topic: string, payload: string): number;
  mqPoll(topic: string, group: string, consumer: string, count?: number, blockMs?: number): Record<string, any>[];
  mqAck(topic: string, group: string, consumer: string, messageId: number): void;
  mqLen(topic: string): number;
  mqDrop(topic: string): void;
  mqSubscribe(topic: string, group: string): void;
  mqUnsubscribe(topic: string, group: string): void;
  mqListSubscriptions(topic: string): string[];

  // Vector
  vectorInsert(name: string, id: number, vector: number[]): void;
  vectorSearch(name: string, vector: number[], k?: number, metric?: string): { id: number; distance: number }[];
  vectorDelete(name: string, id: number): void;
  vectorCount(name: string): number;
  vectorBatchInsert(name: string, items: { id: number; vector: number[] }[]): number;
  vectorBatchSearch(name: string, vectors: number[][], k?: number, metric?: string): { id: number; distance: number }[][];

  // AI
  aiCreateSession(id: string, metadata?: Record<string, string>, ttl?: number): void;
  aiGetSession(id: string): Record<string, any>;
  aiListSessions(): Record<string, any>[];
  aiDeleteSession(id: string): void;
  aiUpdateSession(id: string, metadata: Record<string, string>): void;
  aiClearContext(sessionId: string): number;
  aiAppendMessage(sessionId: string, message: Record<string, any>): void;
  aiGetHistory(sessionId: string, limit?: number): Record<string, any>[];
  aiGetContextWindow(sessionId: string, maxTokens: number): Record<string, any>[];
  aiGetRecentMessages(sessionId: string, n: number): Record<string, any>[];
  aiStoreMemory(entry: Record<string, any>, embedding: number[]): void;
  aiSearchMemory(embedding: number[], k?: number): Record<string, any>[];
  aiDeleteMemory(id: number): void;
  aiMemoryCount(): number;
  aiUpdateMemory(id: number, content?: string, metadata?: Record<string, string>): void;
  aiStoreMemoriesBatch(entries: Record<string, any>[], embeddings: number[][]): void;
  aiLogTrace(record: Record<string, any>): void;
  aiTokenUsage(sessionId: string): number;
  aiTokenUsageByRun(runId: string): number;

  // Cluster
  clusterStatus(): Record<string, any>;
  clusterRole(): string;
  clusterPromote(): Record<string, any>;
  clusterReplicas(): Record<string, any>[];

  // Ops
  databaseStats(): Record<string, any>;
  healthCheck(): Record<string, any>;

  // Backup
  exportDb(dir: string, keyspaces?: string[]): number;
  importDb(dir: string): number;
}
