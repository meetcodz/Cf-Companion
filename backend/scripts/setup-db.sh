#!/bin/bash
# Run this ONCE after Railway provisions the Postgres DB.
# It creates all tables and generates the Prisma client.

echo "Running Prisma DB push (creates tables from schema)..."
npx prisma db push

echo "Generating Prisma client..."
npx prisma generate

echo "Done. Your database is ready."
