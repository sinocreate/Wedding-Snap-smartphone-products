'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Menu,
  X,
  Heart,
  CheckCircle2,
  Download,
  Camera,
  Trophy,
  Sparkles,
  User,
  Share2,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Photo {
  id: string;
  event_id: string;
  storage_path: string;
  public_url: string;
  user_id: string;
  likes_count: number;
  is_pickup: boolean;
  created_at: string;
}

type FilterType = 'ranking' | 'pickup' | 'mine' | null;

export default function EventPhotoGalleryPage() {
  const params = useParams();
  const eventId = params?.event_id as string;

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let localUserId = localStorage.getItem('wedding_guest_uuid');
    if (!localUserId) {
      localUserId = crypto.randomUUID();
      localStorage.setItem('wedding_guest_uuid', localUserId);
    }
    setUserId(localUserId);

    const cachedLikes = localStorage.getItem(`likes_${eventId}`);
    if (cachedLikes) setMyLikedPhotoIds(JSON.parse(cachedLikes));

    const cachedSaves = localStorage.getItem(`saves_${eventId}`);
    if (cachedSaves) setSavedPhotoIds(JSON.parse(cachedSaves));
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;

    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPhotos(data as Photo[]);
      }
    };

    fetchPhotos();

    const channel = supabase
      .channel(`realtime:photos:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'photos',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPhotos((prev) => [payload.new as Photo, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setPhotos((prev) =>
              prev.map((photo) =>
                photo.id === payload.new.id ? (payload.new as Photo) : photo
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setPhotos((prev) => prev.filter((photo) => photo.id === payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const filteredPhotos = useMemo(() => {
    let result = [...photos];
    if (activeFilter === 'ranking') {
      result.sort((a, b) => b.likes_count - a.likes_count);
    } else if (activeFilter === 'pickup') {
      result = result.filter((p) => p.is_pickup);
    } else if (activeFilter === 'mine') {
      result = result.filter((p) => p.user_id === userId);
    }
    return result;
  }, [photos, activeFilter, userId]);

  const toggleLike = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isLiked = myLikedPhotoIds.includes(photoId);

    if (!isLiked && myLikedPhotoIds.length >= 3) {
      alert('いいねは1人最大3枚までです！');
      return;
    }

    const updatedLikes = isLiked
      ? myLikedPhotoIds.filter((id) => id !== photoId)
      : [...myLikedPhotoIds, photoId];

    setMyLikedPhotoIds(updatedLikes);
    localStorage.setItem(`likes_${eventId}`, JSON.stringify(updatedLikes));

    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id === photoId) {
          return {
            ...p,
            likes_count: isLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
          };
        }
        return p;
      })
    );

    await supabase.rpc('toggle_photo_like', {
      p_event_id: eventId,
      p_photo_id: photoId,
      p_user_id: userId,
    });
  };

  const handleDownload = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(photo.public_url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `wedding_photo_${photo.id}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      if (!savedPhotoIds.includes(photo.id)) {
        const updatedSaves = [...savedPhotoIds, photo.id];
        setSavedPhotoIds(updatedSaves);
        localStorage.setItem(`saves_${eventId}`, JSON.stringify(updatedSaves));
      }
    } catch {
      alert('画像の保存に失敗しました');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !eventId) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${eventId}/${Date.now()}_${crypto.randomUUID()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('wedding-photos')
      .upload(fileName, file);

    if (uploadError) {
      alert('アップロードに失敗しました');
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('wedding-photos').getPublicUrl(uploadData.path);

    await supabase.from('photos').insert({
      event_id: eventId,
      storage_path: uploadData.path,
      public_url: publicUrl,
      user_id: userId,
      likes_count: 0,
      is_pickup: false,
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
        <header className="sticky top-0 z-40 w-full bg-zinc-100/85 backdrop-blur-md border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between">
          <div className="w-6" />
          <h1 className="font-serif italic text-[clamp(1.1rem,4.5vw,1.25rem)] tracking-wider text-zinc-800 select-none">
            Wedding Snap
          </h1>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-zinc-700 hover:text-zinc-950 p-1 active:scale-95 transition"
            aria-label="メニューを開く"
          >
            <Menu className="w-6 h-6" strokeWidth={1.5} />
          </button>
        </header>

        <section className="flex justify-between items-center w-full px-6 py-4">
          <button
            onClick={() => setActiveFilter(activeFilter === 'ranking' ? null : 'ranking')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow-md flex flex-col items-center justify-center transition active:scale-95 ${
              activeFilter === 'ranking' ? 'ring-2 ring-zinc-800 ring-offset-2' : ''
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Ranking
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'pickup' ? null : 'pickup')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow-md flex flex-col items-center justify-center transition active:scale-95 ${
              activeFilter === 'pickup' ? 'ring-2 ring-zinc-800 ring-offset-2' : ''
            }`}
          >
            <Sparkles className="w-5 h-5 text-indigo-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Pickup
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow-md flex flex-col items-center justify-center transition active:scale-95 ${
              activeFilter === 'mine' ? 'ring-2 ring-zinc-800 ring-offset-2' : ''
            }`}
          >
            <User className="w-5 h-5 text-emerald-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              mine
            </span>
          </button>
        </section>

        <div className="grid grid-cols-3 gap-[1px] bg-zinc-200 w-full">
          {filteredPhotos.map((photo) => {
            const isLiked = myLikedPhotoIds.includes(photo.id);
            const isSaved = savedPhotoIds.includes(photo.id);
            const isSelected = selectedCellId === photo.id;

            return (
              <div
                key={photo.id}
                onClick={() => setSelectedCellId(isSelected ? null : photo.id)}
                className="w-full aspect-square relative overflow-hidden bg-zinc-100 cursor-pointer select-none"
              >
                <img
                  src={photo.public_url}
                  alt="Wedding photo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                <span className="absolute bottom-1.5 left-1.5 text-[clamp(0.65rem,2.5vw,0.75rem)] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] z-10 pointer-events-none">
                  {photo.likes_count}
                </span>

                <button
                  onClick={(e) => toggleLike(photo.id, e)}
                  className="absolute bottom-1.5 right-1.5 z-20 p-1 active:scale-125 transition"
                  aria-label="いいね"
                >
                  <Heart
                    className={`w-4 h-4 transition-colors ${
                      isLiked
                        ? 'fill-pink-500 text-pink-500'
                        : 'text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]'
                    }`}
                  />
                </button>

                {isSaved && (
                  <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
                    <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white drop-shadow" />
                  </div>
                )}

                {isSelected && (
                  <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex flex-col items-center justify-start pt-3 z-10 transition">
                    <button
                      onClick={(e) => handleDownload(photo, e)}
                      className="p-2 rounded-full bg-white/20 active:scale-90 transition"
                      aria-label="画像を保存"
                    >
                      <Download className="w-6 h-6 text-white" strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border border-zinc-100 active:scale-90 transition-transform"
        aria-label="写真を撮影・アップロード"
      >
        <Camera className="w-7 h-7 text-zinc-900" strokeWidth={1.5} />
      </button>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />
          <aside className="relative w-[75%] max-w-[300px] h-full bg-white shadow-2xl p-6 flex flex-col justify-between z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
                <h2 className="font-serif italic font-bold text-zinc-800 text-lg">Menu</h2>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-800"
                >
                  <X className="w-6 h-6" strokeWidth={1.5} />
                </button>
              </div>

              <nav className="mt-6 space-y-4">
                <button className="flex items-center space-x-3 text-zinc-700 w-full py-2 px-1 text-left font-medium active:bg-zinc-50 rounded">
                  <Share2 className="w-5 h-5 text-zinc-500" />
                  <span>イベントを共有</span>
                </button>
                <button className="flex items-center space-x-3 text-zinc-700 w-full py-2 px-1 text-left font-medium active:bg-zinc-50 rounded">
                  <HelpCircle className="w-5 h-5 text-zinc-500" />
                  <span>使い方ガイド</span>
                </button>
                <button className="flex items-center space-x-3 text-zinc-700 w-full py-2 px-1 text-left font-medium active:bg-zinc-50 rounded">
                  <Settings className="w-5 h-5 text-zinc-500" />
                  <span>ホスト管理設定</span>
                </button>
              </nav>
            </div>

            <div className="text-xs text-zinc-400 space-y-1">
              <p>Guest ID: {userId.slice(0, 8)}...</p>
              <p>Wedding Snap v1.0.0</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

