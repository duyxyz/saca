import { checkAdb, uninstallPackage } from '@/lib/adb';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const packagesParam = searchParams.get('packages');
  let packages = [];
  try {
    packages = JSON.parse(packagesParam);
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid packages parameter' }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event, data) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let device;
      try {
        device = checkAdb();
      } catch (error) {
        sendEvent('error', { message: `Device check failed: ${error.message}` });
        controller.close();
        return;
      }

      sendEvent('start', { total: packages.length });

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        sendEvent('progress', {
          index: i + 1,
          total: packages.length,
          package: pkg,
          status: 'uninstalling'
        });

        try {
          const success = uninstallPackage(device.adbPath, pkg);
          if (success) {
            successCount++;
            sendEvent('progress', {
              index: i + 1,
              total: packages.length,
              package: pkg,
              status: 'success'
            });
          } else {
            failCount++;
            sendEvent('progress', {
              index: i + 1,
              total: packages.length,
              package: pkg,
              status: 'fail'
            });
          }
        } catch (error) {
          failCount++;
          sendEvent('progress', {
            index: i + 1,
            total: packages.length,
            package: pkg,
            status: 'fail',
            error: error.message
          });
        }
      }

      sendEvent('complete', {
        total: packages.length,
        successCount,
        failCount
      });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
