/*
  Warnings:

  - A unique constraint covering the columns `[user_id,url]` on the table `website` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "website_user_id_url_key" ON "public"."website"("user_id", "url");
