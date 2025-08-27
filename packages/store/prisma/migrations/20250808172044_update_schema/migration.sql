/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `region` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."website" DROP CONSTRAINT "website_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."website_tick" DROP CONSTRAINT "website_tick_website_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "region_name_key" ON "public"."region"("name");

-- CreateIndex
CREATE INDEX "website_user_id_idx" ON "public"."website"("user_id");

-- CreateIndex
CREATE INDEX "website_tick_website_id_createdAt_idx" ON "public"."website_tick"("website_id", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."website" ADD CONSTRAINT "website_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."website_tick" ADD CONSTRAINT "website_tick_website_id_fkey" FOREIGN KEY ("website_id") REFERENCES "public"."website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
