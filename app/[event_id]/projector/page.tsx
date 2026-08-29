'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  Trophy,
  Sparkles,
  Clock,
  Heart,
  QrCode,
  Maximize2,
  Minimize2,
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/${eventId}`;
      setGuestUrl(url);
    }
  }, [eventId]);

  // 1. 初期データ取得 ＆ Realtime購読
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
      .channel(`realtime:projector:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photos',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newPhoto = payload.new as Photo;
            setPhotos((prev) => [newPhoto, ...prev]);
            // 新着写真ポップアップ演出（5秒間）
            setNewPostAlert(newPhoto);
            setTimeout(() => setNewPostAlert(null), 5000);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Photo;
            setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
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

  // 2. メインスライドショー（5秒ごとに自動切替）
  const slideshowPhotos = useMemo(() => {
    if (photos.length === 0) return [];
    const pickups = photos.filter((p) => p.is_pickup);
    return pickups.length > 0 ? pickups : photos;
  }, [photos]);

  useEffect(() => {
    if (slideshowPhotos.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slideshowPhotos.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [slideshowPhotos.length]);

  // 3. ランキングTOP 3
  const rankingPhotos = useMemo(() => {
    return [...photos].sort((a, b) => b.likes_count - a.likes_count).slice(0, 3);
  }, [photos]);

  // 4. 最新投稿フィード（直近4枚）
  const latestPhotos = useMemo(() => {
    return photos.slice(0, 4);
  }, [photos]);

  // 全画面切り替え
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const currentSlide = slideshowPhotos[currentIndex] || photos[0];

  return (
    <div className="w-screen h-screen bg-zinc-950 text-white flex flex-col overflow-hidden select-none font-sans">
      {/* 上部ヘッダーバー */}
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

      {/* メイングリッド（16:9比率に最適化） */}
      <div className="flex-1 grid grid-cols-12 gap-6 p-6 overflow-hidden">
        {/* 左側: メインスライドショー ＆ 新着ポップアップ（8カラム） */}
        <div className="col-span-8 h-full relative rounded-3xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-2xl flex items-center justify-center">
          {currentSlide ? (
            <div className="relative w-full h-full flex items-center justify-center p-4">
              {/* 背景ブラー */}
              <div
                className="absolute inset-0 bg-cover bg-center filter blur-3xl opacity-30 scale-110 transition-all duration-1000"
                style={{ backgroundImage: `url(${currentSlide.public_url})` }}
              />

              {/* メイン写真 */}
              <img
                key={currentSlide.id}
                src={currentSlide.original_url || currentSlide.public_url}
                alt="Slideshow"
                className="relative z-10 max-h-full max-w-full object-contain rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-700"
              />

              {/* 写真情報バッジ */}
              <div className="absolute bottom-8 left-8 z-20 flex items-center space-x-3 bg-black/60 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-white/10">
                {currentSlide.is_pickup && (
                  <span className="flex items-center space-x-1 text-amber-400 text-sm font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>新郎新婦 Pickup</span>
                  </span>
                )}
                <div className="flex items-center space-x-1.5 text-pink-400 text-sm font-bold">
                  <Heart className="w-4 h-4 fill-pink-500" />
                  <span>{currentSlide.likes_count} Likes</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-zinc-600">
              <p className="font-serif italic text-2xl mb-2">Waiting for photos...</p>
              <p className="text-sm">QRコードから最初の写真を投稿してください</p>
            </div>
          )}

          {/* 新着投稿ポップアップオーバーレイ */}
          {newPostAlert && (
            <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-lg flex flex-col items-center justify-center p-6 animate-in zoom-in-90 fade-in duration-300">
              <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-zinc-950 font-black text-sm px-4 py-1 rounded-full mb-3 shadow-lg flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4" />
                <span>NEW PHOTO POSTED!</span>
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

        {/* 右側: ライブ情報サイドパネル（4カラム） */}
        <div className="col-span-4 h-full flex flex-col space-y-4 overflow-hidden">
          {/* 1. 会場参加用QRコード（常時表示） */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 flex items-center space-x-4 shadow-xl shrink-0">
            <div className="p-2 bg-white rounded-2xl shrink-0">
              {guestUrl ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                    guestUrl
                  )}`}
                  alt="QR"
                  className="w-20 h-20 rounded"
                />
              ) : (
                <div className="w-20 h-20 bg-zinc-200" />
              )}
            </div>
            <div>
              <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-1 mb-0.5">
                <QrCode className="w-3.5 h-3.5" />
                <span>Join & Share</span>
              </span>
              <h3 className="font-bold text-sm text-zinc-100">スマホで簡単写真共有</h3>
              <p className="text-[11px] text-zinc-400 mt-1">
                QRコードを読み取って写真を投稿＆いいね！
              </p>
            </div>
          </div>

          {/* 2. いいねランキング TOP 3 */}
          <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-3xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-xl">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs pb-2 border-b border-zinc-800">
              <Trophy className="w-4 h-4" />
              <span>POPULAR RANKING TOP 3</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 py-2 my-auto">
              {rankingPhotos.map((photo, rank) => (
                <div key={photo.id} className="relative aspect-square rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700/50 group">
                  <img
                    src={photo.thumb_url || photo.public_url}
                    alt={`Rank ${rank + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {/* 順位クラウンバッジ */}
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
                  {/* いいね数 */}
                  <div className="absolute bottom-1 right-1 bg-black/70 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[10px] font-bold text-pink-400 flex items-center space-x-0.5">
                    <Heart className="w-2.5 h-2.5 fill-pink-500" />
                    <span>{photo.likes_count}</span>
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

          {/* 3. 最新投稿フィード */}
          <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-3xl p-4 flex-1 flex flex-col justify-between overflow-hidden shadow-xl">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold text-xs pb-2 border-b border-zinc-800">
              <Clock className="w-4 h-4" />
              <span>RECENT POSTS</span>
            </div>

            <div className="grid grid-cols-4 gap-2 py-2 my-auto">
              {latestPhotos.map((photo) => (
                <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/50">
                  <img
                    src={photo.thumb_url || photo.public_url}
                    alt="Latest"
                    className="w-full h-full object-cover"
                  />
                  {photo.is_pickup && (
                    <div className="absolute top-1 left-1">
                      <Sparkles className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </div>
                  )}
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
    </div>
  );
}
