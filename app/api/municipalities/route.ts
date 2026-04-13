import { NextResponse } from 'next/server';
import { getMunicipalityList } from '@/lib/tax-tables/tax-lookup';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getMunicipalityList());
}
