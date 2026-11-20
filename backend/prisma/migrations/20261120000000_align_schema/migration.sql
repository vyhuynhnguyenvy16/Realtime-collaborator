-- Aligns the database with schema.prisma.
-- The init migration created PascalCase tables with camelCase columns, while
-- the schema maps to snake_case tables and adds events and snapshots.

-- users
ALTER TABLE "User" RENAME TO "users";
ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "password_hash";
ALTER TABLE "users" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "users" ADD COLUMN "name" TEXT;
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" RENAME CONSTRAINT "User_pkey" TO "users_pkey";
ALTER INDEX "User_email_key" RENAME TO "users_email_key";

-- documents
ALTER TABLE "Document" RENAME TO "documents";
ALTER TABLE "documents" RENAME COLUMN "ownerId" TO "owner_id";
ALTER TABLE "documents" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "documents" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "documents" RENAME CONSTRAINT "Document_pkey" TO "documents_pkey";
ALTER TABLE "documents" DROP CONSTRAINT "Document_ownerId_fkey";
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "documents_owner_id_idx" ON "documents"("owner_id");

-- document_access
ALTER TABLE "DocumentAccess" RENAME TO "document_access";
ALTER TABLE "document_access" RENAME COLUMN "documentId" TO "document_id";
ALTER TABLE "document_access" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "document_access" RENAME CONSTRAINT "DocumentAccess_pkey" TO "document_access_pkey";
ALTER INDEX "DocumentAccess_documentId_userId_key" RENAME TO "document_access_document_id_user_id_key";
ALTER TABLE "document_access" DROP CONSTRAINT "DocumentAccess_documentId_fkey";
ALTER TABLE "document_access" DROP CONSTRAINT "DocumentAccess_userId_fkey";
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_access" ADD CONSTRAINT "document_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "document_access_user_id_idx" ON "document_access"("user_id");

-- document_events
CREATE TABLE "document_events" (
    "id" BIGSERIAL NOT NULL,
    "document_id" TEXT NOT NULL,
    "update_data" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_events_document_id_id_idx" ON "document_events"("document_id", "id");
ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- document_snapshots
CREATE TABLE "document_snapshots" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "snapshot_data" BYTEA NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "document_snapshots_document_id_version_idx" ON "document_snapshots"("document_id", "version");
ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_snapshots" ADD CONSTRAINT "document_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
