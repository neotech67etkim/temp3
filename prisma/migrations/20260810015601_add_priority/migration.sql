-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('URGENT', 'HIGH', 'NORMAL', 'LOW');

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "priority" "Priority" NOT NULL DEFAULT 'NORMAL';
