import { NextResponse } from 'next/server';
import { checkAdb } from '@/lib/adb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const device = checkAdb();
    return NextResponse.json({
      success: true,
      device: {
        serial: device.serial,
        state: device.state,
        model: device.model,
        brand: device.brand,
        androidVersion: device.androidVersion
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message || 'Device disconnected or unauthorized.'
    }, { status: 500 });
  }
}
