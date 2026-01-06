'use client';

import { useEffect } from 'react';

export const SuppressFastRefreshLogs = () => {
  useEffect(() => {
    const originalLog = console.log;
    console.log = function (...args: any[]) {
      const message = args[0];
      if (
        typeof message === 'string' &&
        (message.includes('[Fast Refresh]') ||
          message.includes('hot-reloader-client'))
      ) {
        return;
      }
      originalLog.apply(console, args);
    };

    return () => {
      console.log = originalLog;
    };
  }, []);

  return null;
};

