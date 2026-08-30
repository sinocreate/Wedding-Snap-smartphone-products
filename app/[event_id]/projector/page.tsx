'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Trophy,
  Sparkles,
  Clock,
  Heart,
  QrCode,
  Maximize2,
  Minimize2,
  Award,
  Crown,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkle,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const getCleanSupabaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try {
    const parsed = new URL(envUrl.startsWith('http') ? envUrl : `https://${envUrl}`);
    return parsed.origin;
  } catch {
    return 'https://placeholder.supabase.co';
  }
};

const supabaseUrl = getCleanSupabaseUrl();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder');

interface Photo {
  id: string;
  event_id: string;
  storage_path: string;
  public_url: string;
  thumb_url?: string;
  original_url?: string;
  user_id: string;
  user_name?: string;
  likes_count: number;
  is_pickup: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
}

export default function ProjectorLivePage() {
  const params = useParams();
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [newPostAlert, setNewPostAlert] = useState<Photo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [guestUrl, setGuestUrl] = useState('');

  // 👑 ランキング発表モード状態
  const [isCeremonyOpen, setIsCeremonyOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<number>(3); // 3 -> 2 -> 1

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGuestUrl(`${window.location.origin}/${eventId}`);
    }
  }, [eventId]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const initEvent = async () => {
      const { data } = await supabase.from('events').select('id, title').eq('id', eventId).single();
      if (data) setEventData(data);
    };
    initEvent();

    const fetchPhotos = async () => {
      const { data } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (data) setPhotos(data as Photo[]);
    };
    fetchPhotos();

    const channel = supabase
      .channel(`rt_projector_${eventId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        (payload) => {
          const newPhoto = payload.new as Photo;
          if (payload.eventType === 'INSERT') {
            if (newPhoto.event_id === eventId) {
              setPhotos((prev) => [newPhoto, ...prev]);
              setNewPostAlert(newPhoto);
              setTimeout(() => setNewPostAlert(null), 5000);
            }
          } else if (payload.eventType === 'UPDATE') {
            if (newPhoto.event_id === eventId) {
              setPhotos((prev) => prev.map((p) => (p.id === newPhoto.id ? newPhoto : p)));
            }
          } else if (payload.eventType === 'DELETE') {
            setPhotos((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const slideshowPhotos = useMemo(() => {
    if (photos.length === 0) return [];
    const pickups = photos.filter((p) => p.is_pickup);
    return pickups.length > 0 ? pickups : photos;
  }, [photos]);

  useEffect(() => {
    if (slideshowPhotos.length <= 1 || isCeremonyOpen) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideshowPhotos.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [slideshowPhotos.length, isCeremonyOpen]);

  const rankingPhotos = useMemo(() => {
    return [...photos].sort((a, b) => b.likes_count - a.likes_count).slice(0, 3);
  }, [photos]);

  const latestPhotos = useMemo(() => {
    return photos.slice(0, 4);
  }, [photos]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // 紙吹雪（Confetti）発射関数
  const fireConfetti = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!(window as any).confetti) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
      document.body.appendChild(script);
      await new Promise((resolve) => { script.onload = resolve; });
    }
    const confetti = (window as any).confetti;
    if (confetti) {
      confetti({
        particleCount: 120,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#fbbf24', '#f59e0b', '#ec4899', '#ffffff'],
      });
    }
  }, []);

  // ステップ切り替え処理
  const handleSelectStep = (step: number) => {
    setCeremonyStep(step);
    if (step === 1) {
      fireConfetti();
    }
  };

  const handleNextStep = () => {
    if (ceremonyStep === 3) handleSelectStep(2);
    else if (ceremonyStep === 2) handleSelectStep(1);
  };

  const handlePrevStep = () => {
    if (ceremonyStep === 1) handleSelectStep(2);
    else if (ceremonyStep === 2) handleSelectStep(3);
  };

  // キーボード操作対応
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCeremonyOpen) return;
      if (e.key === 'ArrowLeft') handlePrevStep();
      if (e.key === 'ArrowRight' || e.key === ' ') handleNextStep();
      if (e.key === 'Escape') setIsCeremonyOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCeremonyOpen, ceremonyStep]);

  const currentSlide = slideshowPhotos[currentIndex] || photos[0];
  const ceremonyTargetPhoto = rankingPhotos[ceremonyStep - 1];

  return (
    <div className="w-screen h-screen bg-zinc-950 text-white flex flex-col overflow-hidden select-none font-sans">
      {/* 上部バー */}
      <header className="h-16 px-8 bg-zinc-900/80 backdrop-blur-md border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center space-x-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="font-serif italic text-2xl tracking-wider font-light text-zinc-100">
            {eventData.title}
          </h1>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium ml-2">
            LIVE SCREEN
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => {
              setCeremonyStep(3);
              setIsCeremonyOpen(true);
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-black rounded-xl text-sm flex items-center space-x-2 shadow-xl shadow-amber-500/20 active:scale-95 transition"
          >
            <Trophy className="w-4 h-4" />
            <span>🏆 表彰式・ランキング発表</span>
          </button>

          <span className="text-sm text-zinc-400">
            投稿枚数: <strong className="text-white text-base">{photos.length}</strong> 枚
          </span>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition text-zinc-300"
            title="全画面表示"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* メイン画面 */}
      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* 左側: スライドショー */}
        <div className="col-span-8 h-full relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800 shadow-2xl flex items-center justify-center">
          {currentSlide ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-30 scale-110 transition-all duration-1000"
                style={{ backgroundImage: `url(${currentSlide.public_url})` }}
              />

              <img
                key={currentSlide.id}
                src={currentSlide.original_url || currentSlide.public_url}
                alt="Slideshow"
                className="relative z-10 max-h-full max-w-full object-contain rounded-2xl shadow-2xl animate-in fade-in duration-700"
              />

              <div className="absolute bottom-8 left-8 z-20 flex items-center space-x-3 bg-black/70 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10">
                {currentSlide.is_pickup && (
                  <span className="flex items-center space-x-1 text-amber-400 text-sm font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>新郎新婦 Pickup</span>
                  </span>
                )}
                <span className="text-sm text-zinc-200 font-medium">
                  📸 <strong>{currentSlide.user_name || 'ゲスト'}</strong> 様
                </span>
                <div className="flex items-center space-x-1.5 text-pink-400 text-sm font-bold pl-2 border-l border-white/20">
                  <Heart className="w-4 h-4 fill-pink-500" />
                  <span>{currentSlide.likes_count}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-zinc-600">
              <p className="font-serif italic text-2xl mb-2">Waiting for photos...</p>
              <p className="text-sm">QRコードから最初の写真を投稿してください</p>
            </div>
          )}

          {/* 新着投稿ポップアップ */}
          {newPostAlert && (
            <div className="absolute inset-0 z-30 bg-black/85 backdrop-blur-lg flex flex-col items-center justify-center p-6 animate-in zoom-in-90 fade-in duration-300">
              <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-zinc-950 font-black text-sm px-5 py-1.5 rounded-full mb-3 shadow-xl flex items-center space-x-2">
                <Sparkles className="w-4 h-4" />
                <span>NEW PHOTO BY {newPostAlert.user_name || 'ゲスト'}！</span>
              </div>
              <div className="max-h-[70%] max-w-[80%] rounded-2xl overflow-hidden border-2 border-white/30 shadow-2xl bg-black">
                <img
                  src={newPostAlert.original_url || newPostAlert.public_url}
                  alt="New post"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            </div>
          )}
        </div>

        {/* 右側サイドパネル */}
        <div className="col-span-4 h-full flex flex-col space-y-4 overflow-hidden">
          {/* QRコード */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-4 flex items-center space-x-4 shadow-xl shrink-0">
            <div className="p-2 bg-white rounded-2xl shrink-0">
              {guestUrl && (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(guestUrl)}`}
                  alt="QR"
                  className="w-20 h-20 rounded"
                />
              )}
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1 mb-0.5">
                <QrCode className="w-3.5 h-3.5" />
                <span>Join & Share</span>
              </span>
              <h3 className="font-bold text-sm text-zinc-100">スマホで写真共有</h3>
              <p className="text-[11px] text-zinc-400 mt-1">
                QRコードから写真をアップロード＆いいね！
              </p>
            </div>
          </div>

          {/* ランキングTOP 3 */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-xl">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs pb-2 border-b border-zinc-800">
              <Trophy className="w-4 h-4" />
              <span>POPULAR RANKING TOP 3</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 py-2 my-auto">
              {rankingPhotos.map((photo, rank) => (
                <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700">
                  <img
                    src={photo.thumb_url || photo.public_url}
                    alt={`Rank ${rank + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div
                    className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-full text-xs font-black flex items-center justify-center shadow-lg ${
                      rank === 0
                        ? 'bg-amber-400 text-zinc-950 ring-2 ring-amber-300'
                        : rank === 1
                        ? 'bg-zinc-300 text-zinc-950'
                        : 'bg-amber-700 text-white'
                    }`}
                  >
                    {rank + 1}
                  </div>
                  <div className="absolute bottom-1 inset-x-1 bg-black/75 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center justify-between text-zinc-200">
                    <span className="truncate max-w-[60%]">{photo.user_name || 'ゲスト'}</span>
                    <span className="text-pink-400 flex items-center space-x-0.5">
                      <Heart className="w-2.5 h-2.5 fill-pink-500 inline" />
                      <span>{photo.likes_count}</span>
                    </span>
                  </div>
                </div>
              ))}
              {[...Array(Math.max(0, 3 - rankingPhotos.length))].map((_, i) => (
                <div key={i} className="aspect-square rounded-2xl bg-zinc-800/40 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-xs font-bold">
                  TOP {rankingPhotos.length + i + 1}
                </div>
              ))}
            </div>
          </div>

          {/* 最新投稿 */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-xl">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs pb-2 border-b border-zinc-800">
              <Clock className="w-4 h-4" />
              <span>RECENT POSTS</span>
            </div>

            <div className="grid grid-cols-4 gap-2 py-2 my-auto">
              {latestPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700">
                  <img
                    src={photo.thumb_url || photo.public_url}
                    alt="Latest"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-center truncate py-0.5 px-1 text-zinc-300">
                    {photo.user_name || 'ゲスト'}
                  </div>
                </div>
              ))}
              {[...Array(Math.max(0, 4 - latestPhotos.length))].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-zinc-800/40 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 text-[10px]">
                  NEW
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 👑 表彰式・ランキング発表全画面モーダル（完全版） */}
      {isCeremonyOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-between p-8 animate-in fade-in duration-300 select-none">
          <div className="w-full flex justify-between items-center">
            <div className="flex items-center space-x-3 text-amber-400 font-black text-2xl tracking-widest uppercase">
              <Crown className="w-8 h-8 animate-bounce" />
              <span>BEST PHOTO AWARDS</span>
            </div>
            <button
              onClick={() => setIsCeremonyOpen(false)}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
              title="閉じる (Esc)"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* 写真表示エリア */}
          <div className="relative flex-1 w-full max-w-4xl flex flex-col items-center justify-center my-2">
            {ceremonyTargetPhoto ? (
              <div key={ceremonyStep} className="relative flex flex-col items-center animate-in zoom-in-90 fade-in duration-300">
                {/* 順位クラウンバッジ */}
                <div
                  className={`text-xl md:text-2xl font-black px-8 py-2.5 rounded-full mb-4 shadow-2xl flex items-center space-x-3 tracking-widest ${
                    ceremonyStep === 1
                      ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-zinc-950 ring-4 ring-amber-300 shadow-amber-500/50'
                      : ceremonyStep === 2
                      ? 'bg-gradient-to-r from-slate-200 to-slate-400 text-zinc-950 ring-2 ring-slate-100'
                      : 'bg-gradient-to-r from-amber-800 to-amber-900 text-amber-100 ring-2 ring-amber-700'
                  }`}
                >
                  <Award className="w-7 h-7" />
                  <span>
                    {ceremonyStep === 1 ? '👑 堂々の第 1 位 （グランプリ）' : `✨ 第 ${ceremonyStep} 位`}
                  </span>
                </div>

                {/* 受賞写真 */}
                <div className={`max-h-[48vh] rounded-3xl overflow-hidden shadow-2xl bg-black border-4 ${
                  ceremonyStep === 1 ? 'border-amber-400 shadow-amber-500/30' : 'border-zinc-700'
                }`}>
                  <img
                    src={ceremonyTargetPhoto.original_url || ceremonyTargetPhoto.public_url}
                    alt="Award winner"
                    className="max-h-[48vh] w-auto object-contain"
                  />
                </div>

                {/* 撮影者名 ＆ いいね数 */}
                <div className="mt-4 text-center space-y-1">
                  <h3 className="text-3xl md:text-4xl font-black text-white tracking-wide">
                    撮影者: <span className="text-amber-400 underline decoration-amber-500 underline-offset-8">{ceremonyTargetPhoto.user_name || 'ゲスト'}</span> 様
                  </h3>
                  <p className="text-pink-400 font-bold text-lg pt-1">
                    獲得数: {ceremonyTargetPhoto.likes_count} いいね！
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center text-zinc-500 space-y-2">
                <Trophy className="w-16 h-16 mx-auto opacity-30" />
                <p className="text-xl font-bold">第 {ceremonyStep} 位の写真がまだありません</p>
                <p className="text-sm text-zinc-600">写真にいいねを集めて順位を決定しましょう！</p>
              </div>
            )}
          </div>

          {/* 下部ナビゲーションコントローラー */}
          <div className="flex items-center space-x-4 bg-zinc-900/90 border border-zinc-800 px-6 py-3.5 rounded-3xl shadow-2xl">
            {/* 前の順位へ */}
            <button
              disabled={ceremonyStep === 3}
              onClick={handlePrevStep}
              className={`p-3 rounded-2xl flex items-center space-x-1 transition ${
                ceremonyStep === 3 ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-300 hover:bg-zinc-800 active:scale-95'
              }`}
              title="前の順位 (←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* 順位選択ボタン群 */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleSelectStep(3)}
                className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition ${
                  ceremonyStep === 3
                    ? 'bg-amber-800 text-white shadow-lg'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                }`}
              >
                第3位
              </button>

              <button
                onClick={() => handleSelectStep(2)}
                className={`px-5 py-2.5 rounded-2xl font-bold text-sm transition ${
                  ceremonyStep === 2
                    ? 'bg-slate-200 text-zinc-950 font-black shadow-lg'
                    : 'bg-zinc-800/80 text-zinc-400 hover:text-white'
                }`}
              >
                第2位
              </button>

              <button
                onClick={() => handleSelectStep(1)}
                className={`px-6 py-2.5 rounded-2xl font-black text-sm transition ${
                  ceremonyStep === 1
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-zinc-950 shadow-lg shadow-amber-500/30 ring-2 ring-amber-300'
                    : 'bg-zinc-800/80 text-amber-400 hover:bg-zinc-700'
                }`}
              >
                👑 第1位
              </button>
            </div>

            {/* 次の順位へ進むメインボタン */}
            {ceremonyStep > 1 && (
              <button
                onClick={handleNextStep}
                className="ml-4 px-6 py-2.5 bg-white hover:bg-zinc-200 active:scale-95 text-zinc-950 font-black text-sm rounded-2xl flex items-center space-x-1.5 shadow-xl transition"
              >
                <span>{ceremonyStep === 3 ? '第2位を発表 ➔' : '👑 第1位を発表 ➔'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
