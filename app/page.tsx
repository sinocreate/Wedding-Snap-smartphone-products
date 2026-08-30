'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [eventCode, setEventCode] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = eventCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (clean) {
      router.push(`/${clean}`);
    } else {
      alert('イベントコードを入力してください');
    }
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex flex-col items-center justify-between p-6 select-none font-sans text-zinc-800">
      <div className="w-full" />

      {/* メインカード */}
      <main className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-zinc-100 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 text-white flex items-center justify-center mx-auto shadow-lg">
          <Camera className="w-8 h-8" strokeWidth={1.5} />
        </div>

        <div>
          <h1 className="font-serif italic text-3xl font-normal tracking-wide text-zinc-900">
            Wedding Snap
          </h1>
          <p className="text-xs text-zinc-400 mt-2 font-medium">
            結婚式・披露宴の想い出をリアルタイムに共有
          </p>
        </div>

        {/* 参加コード入場フォーム */}
        <form onSubmit={handleJoin} className="space-y-3 pt-2">
          <input
            type="text"
            placeholder="イベントコードを入力 (例: demo-wedding)"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-100 rounded-2xl text-center text-sm font-medium focus:ring-2 focus:ring-zinc-800 focus:outline-none border-none"
          />

          <button
            type="submit"
            className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 active:scale-98 text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 shadow transition"
          >
            <span>写真アルバムに入場する</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <p className="text-[11px] text-zinc-400">
          ※ 式場で配布されたQRコードをお持ちの方は、カメラで読み取って直接ご参加いただけます。
        </p>
      </main>

      {/* サービス提供者用フッターリンク */}
      <footer className="pb-4">
        <a
          href="/admin"
          className="flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>サービス提供者（マスター管理）</span>
        </a>
      </footer>
    </div>
  );
}
