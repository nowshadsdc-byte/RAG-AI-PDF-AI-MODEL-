import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export type Citation = {
  documentId: string;
  documentName: string;
  page: number;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storagePath: text("storage_path").notNull(),
    // Indexing runs in the background after upload:
    // processing -> ready (searchable) or failed (see `error`).
    status: text("status")
      .$type<"processing" | "ready" | "failed">()
      .default("ready")
      .notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    // SHA-256 of the assembled file, recorded for integrity checks.
    sha256: text("sha256"),
    pageCount: integer("page_count"),
    indexedPages: integer("indexed_pages").default(0).notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("documents_user_id_idx").on(table.userId)],
);

// One row per chunked upload in progress. The file bytes are kept on disk
// (storage/uploads/<id>/<n>.part), never in the database.
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    totalSize: bigint("total_size", { mode: "number" }).notNull(),
    chunkSize: integer("chunk_size").notNull(),
    totalChunks: integer("total_chunks").notNull(),
    status: text("status")
      .$type<"uploading" | "assembling" | "complete" | "failed">()
      .default("uploading")
      .notNull(),
    documentId: uuid("document_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("uploads_user_id_idx").on(table.userId)],
);

// Which chunks of an upload have arrived. The primary key
// (upload_id, chunk_index) makes a duplicate chunk impossible.
export const uploadChunks = pgTable(
  "upload_chunks",
  {
    uploadId: uuid("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.uploadId, table.chunkIndex] })],
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    pageNumber: integer("page_number").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("document_chunks_document_chunk_unique").on(
      table.documentId,
      table.chunkIndex,
    ),
    index("document_chunks_document_id_idx").on(table.documentId),
    index("document_chunks_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").default("New conversation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("conversations_user_id_idx").on(table.userId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    citations: jsonb("citations").$type<Citation[]>().default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)],
);
