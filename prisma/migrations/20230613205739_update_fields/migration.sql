-- AlterTable
ALTER TABLE "asks" ALTER COLUMN "db_created_at" DROP NOT NULL,
ALTER COLUMN "db_updated_at" DROP NOT NULL,
ALTER COLUMN "db_updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "db_created_at" DROP NOT NULL,
ALTER COLUMN "db_updated_at" DROP NOT NULL,
ALTER COLUMN "db_updated_at" SET DEFAULT CURRENT_TIMESTAMP;
