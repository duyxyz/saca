import { NextResponse } from 'next/server';
import { checkAdb, getPackages } from '@/lib/adb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const device = checkAdb();
    const { sysPackages, userPackages } = getPackages(device.adbPath);
    return NextResponse.json({
      success: true,
      sysPackages,
      userPackages
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to retrieve package list.'
    }, { status: 500 });
  }
}
