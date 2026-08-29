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
  ImagePlus,
  ImageIcon,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// Supabase クライアント初期化
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

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
  // パラメータが空の場合でも安全なデフォルト値を設定
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  // 1. 端末固有ID ＆ キャッシュ復元
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

  // 2. 写真一覧取得 ＆ リアルタイム同期
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey) return;

    // イベントの存在を保証
    const ensureEvent = async () => {
      await supabase
        .from('events')
        .upsert({ id: eventId, title: 'Wedding Snap' }, { onConflict: 'id' });
    };
    ensureEvent();

    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', eventId)
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
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPhotos((prev) => {
              const exists = prev.some((p) => p.id === (payload.new as Photo).id);
              return exists ? prev : [payload.new as Photo, ...prev];
            });
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

  // 3. フィルタリング
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

  // 4. いいねトグル
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

    try {
      await supabase.rpc('toggle_photo_like', {
        p_event_id: eventId,
        p_photo_id: photoId,
        p_user_id: userId,
      });
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  // 5. 画像保存
  const handleDownload = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(photo.public_url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `wedding_${photo.id.slice(0, 8)}.jpg`;
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

  // 6. 画像アップロード（スラッシュのない完全安全なパス設計）
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) {
      alert('Vercelの環境変数（SUPABASE_URL / ANON_KEY）が未設定です');
      return;
    }

    try {
      setIsUploading(true);
      setIsActionSheetOpen(false);

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const cleanExt = ext.replace(/[^a-z0-9]/g, '') || 'jpg';
      const randomStr = Math.random().toString(36).substring(2, 10);
      
      // スラッシュを含まないフラットなファイル名（Storageエラーを完全回避）
      const safeFileName = `${eventId}_${Date.now()}_${randomStr}.${cleanExt}`;

      // Storageアップロード
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('wedding-photos')
        .upload(safeFileName, file, {
          cacheControl: '3600',
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storageエラー: ${uploadError.message}`);
      }

      // 公開URL取得
      const {
        data: { publicUrl },
      } = supabase.storage.from('wedding-photos').getPublicUrl(uploadData.path);

      // データベース登録
      const { error: dbError } = await supabase.from('photos').insert({
        event_id: eventId,
        storage_path: uploadData.path,
        public_url: publicUrl,
        user_id: userId,
        likes_count: 0,
        is_pickup: false,
      });

      if (dbError) {
        throw new Error(`DBエラー: ${dbError.message}`);
      }
    } catch (err: any) {
      alert(err.message || 'アップロードに失敗しました');
    } finally {
      setIsUploading(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (albumInputRef.current) albumInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      {/* メインコンテナ（横幅100%フィット） */}
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
        {/* (1) 固定すりガラスヘッダー */}
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

        {/* (2) 3大円形ナビゲーション */}
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

        {/* (3) 3カラム正方形写真グリッド */}
        {filteredPhotos.length === 0 ? (
          <div className="w-full">
            <div className="grid grid-cols-3 gap-[1px] bg-zinc-200 w-full">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="w-full aspect-square bg-zinc-50 flex flex-col items-center justify-center text-zinc-300"
                >
                  <ImagePlus className="w-6 h-6 opacity-40 mb-1" strokeWidth={1.5} />
                  <span className="text-[10px] opacity-40">枠 {i + 1}</span>
                </div>
              ))}
            </div>
            <div className="py-8 text-center px-4">
              <p className="text-sm font-medium text-zinc-600 mb-1">写真がまだありません</p>
              <p className="text-xs text-zinc-400">
                右下のカメラボタンから写真を追加してください
              </p>
            </div>
          </div>
        ) : (
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
                    alt="Wedding memory"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  {/* 左下いいね数 */}
                  <span className="absolute bottom-1.5 left-1.5 text-[clamp(0.65rem,2.5vw,0.75rem)] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] z-10 pointer-events-none">
                    {photo.likes_count}
                  </span>

                  {/* 右下ハートトグル */}
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

                  {/* 右上保存済みバッジ */}
                  {isSaved && (
                    <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
                      <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white drop-shadow" />
                    </div>
                  )}

                  {/* タップ時の周辺減光オーバーレイ ＆ 保存アイコン */}
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
        )}
      </main>

      {/* 隠しインプット（撮影用 ＆ アルバム選択用） */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* (4) フローティング撮影/追加ボタン (FAB) */}
      <button
        disabled={isUploading}
        onClick={() => setIsActionSheetOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border border-zinc-100 active:scale-90 transition-transform ${
          isUploading ? 'opacity-50 animate-pulse' : ''
        }`}
        aria-label="写真を追加"
      >
        <Camera className="w-7 h-7 text-zinc-900" strokeWidth={1.5} />
      </button>

      {/* 写真追加アクションシート（撮影 or アルバム選択） */}
      {isActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/40 backdrop-blur-[2px]">
          <div
            className="absolute inset-0"
            onClick={() => setIsActionSheetOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl z-10 space-y-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] animate-in slide-in-from-bottom duration-200">
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-2" />
            <h3 className="text-center font-bold text-zinc-800 text-sm mb-4">写真を追加する</h3>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-900 text-white rounded-2xl font-medium flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Camera className="w-5 h-5" />
              <span>写真を撮影する</span>
            </button>

            <button
              onClick={() => albumInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-100 text-zinc-800 rounded-2xl font-medium flex items-center justify-center space-x-2 active:scale-98 transition"
            >
              <ImageIcon className="w-5 h-5 text-zinc-600" />
              <span>アルバムから選択</span>
            </button>

            <button
              onClick={() => setIsActionSheetOpen(false)}
              className="w-full py-3 text-zinc-400 font-medium text-sm active:text-zinc-600 transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* (1-b) 右スライドインドロワー */}
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
