'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // デモ用イベント画面へ自動転送
    router.replace('/demo-wedding');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex items-center justify-center">
      <div className="text-zinc-600 font-serif italic text-lg animate-pulse">
        Loading Wedding Snap...
      </div>
    </div>
  );
}

