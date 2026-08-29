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
  Loader2,
  Trash2,
  Star,
  Monitor,
  Lock,
  Unlock,
  QrCode,
  Copy,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// 1人あたりの投稿上限枚数（0 = 無制限）
const MAX_UPLOAD_PER_USER = 0;

// URL正規化
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
  is_hd_ready?: boolean;
  user_id: string;
  likes_count: number;
  is_pickup: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
  host_pin: string;
}

type FilterType = 'ranking' | 'pickup' | 'mine' | null;

// 軽量サムネイル即時生成
const createThumbnailBlob = (file: File, maxDimension = 600, quality = 0.7): Promise<Blob> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

export default function EventPhotoGalleryPage() {
  const params = useParams();
  const rawParam = Array.isArray(params?.event_id) ? params.event_id[0] : params?.event_id;
  const eventId = (rawParam || 'demo-wedding').replace(/[^a-zA-Z0-9_-]/g, '') || 'demo-wedding';

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap', host_pin: '1234' });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // モーダル・ドロワー状態管理
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isHostMode, setIsHostMode] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  // 1. 端末UUID ＆ キャッシュ復元
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

    const hostSession = sessionStorage.getItem(`host_auth_${eventId}`);
    if (hostSession === 'true') setIsHostMode(true);
  }, [eventId]);

  // 2. 初期データ取得 ＆ Realtime同期
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    // イベント取得または作成
    const initEvent = async () => {
      const { data } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (data) {
        setEventData(data);
      } else {
        const defaultEvt = { id: eventId, title: 'Wedding Snap', host_pin: '1234' };
        await supabase.from('events').upsert(defaultEvt);
        setEventData(defaultEvt);
      }
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
              prev.map((p) => (p.id === payload.new.id ? (payload.new as Photo) : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setPhotos((prev) => prev.filter((p) => p.id === payload.old.id));
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
      const downloadTargetUrl = photo.original_url || photo.public_url;
      const response = await fetch(downloadTargetUrl);
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

  // 6. 2段階アップロード処理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (MAX_UPLOAD_PER_USER > 0) {
      const myCount = photos.filter((p) => p.user_id === userId).length;
      if (myCount >= MAX_UPLOAD_PER_USER) {
        alert(`写真の投稿は1人最大${MAX_UPLOAD_PER_USER}枚までです`);
        return;
      }
    }

    try {
      setIsUploading(true);
      setIsActionSheetOpen(false);

      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const thumbFileName = `thumb_${eventId}_${timestamp}_${rand}.jpg`;
      const originalFileName = `hd_${eventId}_${timestamp}_${rand}.jpg`;

      // サムネイル生成 ＆ 即時アップロード
      const thumbBlob = await createThumbnailBlob(file, 600, 0.7);
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from('wedding-photos')
        .upload(thumbFileName, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (thumbError) throw new Error(`サムネイル送信失敗: ${thumbError.message}`);

      const {
        data: { publicUrl: thumbPublicUrl },
      } = supabase.storage.from('wedding-photos').getPublicUrl(thumbData.path);

      // DB即時挿入
      const { data: insertedPhoto, error: dbError } = await supabase
        .from('photos')
        .insert({
          event_id: eventId,
          storage_path: thumbData.path,
          public_url: thumbPublicUrl,
          thumb_url: thumbPublicUrl,
          original_url: null,
          is_hd_ready: false,
          user_id: userId,
          likes_count: 0,
          is_pickup: false,
        })
        .select()
        .single();

      if (dbError) throw new Error(`DB保存失敗: ${dbError.message}`);

      setIsUploading(false);

      // バックグラウンド高画質アップロード
      (async () => {
        try {
          const { data: hdData, error: hdError } = await supabase.storage
            .from('wedding-photos')
            .upload(originalFileName, file, {
              contentType: file.type || 'image/jpeg',
              upsert: true,
            });

          if (!hdError && hdData) {
            const {
              data: { publicUrl: hdPublicUrl },
            } = supabase.storage.from('wedding-photos').getPublicUrl(hdData.path);

            await supabase.rpc('update_photo_hd', {
              p_photo_id: insertedPhoto.id,
              p_original_url: hdPublicUrl,
            });
          }
        } catch (bgErr) {
          console.error('HD Upload Error:', bgErr);
        }
      })();
    } catch (err: any) {
      alert(err.message || 'アップロードに失敗しました');
      setIsUploading(false);
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (albumInputRef.current) albumInputRef.current.value = '';
    }
  };

  // 7. ホスト専用操作（Pickupトグル & 削除）
  const handleTogglePickup = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = !photo.is_pickup;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_pickup: newStatus } : p)));
    await supabase.from('photos').update({ is_pickup: newStatus }).eq('id', photo.id);
  };

  const handleDeletePhoto = async (photo: Photo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('この写真を削除しますか？（復元できません）')) return;

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await supabase.from('photos').delete().eq('id', photo.id);
    setSelectedCellId(null);
  };

  // ホストPIN認証チェック
  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === eventData.host_pin) {
      setIsHostMode(true);
      sessionStorage.setItem(`host_auth_${eventId}`, 'true');
      setIsPinModalOpen(false);
      setIsDrawerOpen(false);
      setPinInput('');
    } else {
      alert('PINコードが正しくありません');
    }
  };

  const handleLogoutHost = () => {
    setIsHostMode(false);
    sessionStorage.removeItem(`host_auth_${eventId}`);
    setIsDrawerOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
        {/* ホストモード稼働中バナー */}
        {isHostMode && (
          <div className="sticky top-0 z-50 bg-amber-500 text-zinc-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow">
            <span className="flex items-center space-x-1">
              <Unlock className="w-3.5 h-3.5" />
              <span>ホスト管理者モード中</span>
            </span>
            <button onClick={handleLogoutHost} className="underline text-[11px]">
              終了
            </button>
          </div>
        )}

        {/* (1) 固定すりガラスヘッダー */}
        <header className="sticky top-0 z-40 w-full bg-zinc-100/85 backdrop-blur-md border-b border-zinc-200/80 px-4 py-3 flex items-center justify-between">
          <div className="w-6" />
          <h1 className="font-serif italic text-[clamp(1.1rem,4.5vw,1.25rem)] tracking-wider text-zinc-800 select-none">
            {eventData.title}
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
              const displayUrl = photo.thumb_url || photo.public_url;

              return (
                <div
                  key={photo.id}
                  onClick={() => setSelectedCellId(isSelected ? null : photo.id)}
                  className="w-full aspect-square relative overflow-hidden bg-zinc-100 cursor-pointer select-none"
                >
                  <img
                    src={displayUrl}
                    alt="Wedding photo"
                    className="w-full h-full object-cover transition-opacity duration-300"
                    loading="lazy"
                  />

                  {/* 左下いいね数 */}
                  <span className="absolute bottom-1.5 left-1.5 text-[clamp(0.65rem,2.5vw,0.75rem)] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] z-10 pointer-events-none">
                    {photo.likes_count}
                  </span>

                  {/* Pickupバッジ */}
                  {photo.is_pickup && (
                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400 drop-shadow" />
                    </div>
                  )}

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

                  {/* セル選択オーバーレイ */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex flex-col items-center justify-center p-2 z-20 transition space-y-2">
                      <button
                        onClick={(e) => handleDownload(photo, e)}
                        className="p-2.5 rounded-full bg-white/25 active:scale-90 transition flex items-center justify-center"
                        aria-label="画像を保存"
                      >
                        <Download className="w-5 h-5 text-white" strokeWidth={2} />
                      </button>

                      {/* ホスト専用アクション（Pickup ＆ 削除） */}
                      {isHostMode && (
                        <div className="flex space-x-2 pt-1 border-t border-white/20">
                          <button
                            onClick={(e) => handleTogglePickup(photo, e)}
                            className={`p-2 rounded-full active:scale-90 transition ${
                              photo.is_pickup ? 'bg-amber-400 text-zinc-950' : 'bg-white/25 text-white'
                            }`}
                            title="Pickup切り替え"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => handleDeletePhoto(photo, e)}
                            className="p-2 rounded-full bg-red-500 text-white active:scale-90 transition"
                            title="写真を削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 隠しインプット */}
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

      {/* (4) FAB */}
      <button
        disabled={isUploading}
        onClick={() => setIsActionSheetOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 w-14 h-14 rounded-full bg-white shadow-xl flex items-center justify-center border border-zinc-100 active:scale-90 transition-transform ${
          isUploading ? 'opacity-70' : ''
        }`}
        aria-label="写真を追加"
      >
        {isUploading ? (
          <Loader2 className="w-6 h-6 text-zinc-900 animate-spin" />
        ) : (
          <Camera className="w-7 h-7 text-zinc-900" strokeWidth={1.5} />
        )}
      </button>

      {/* 写真追加アクションシート */}
      {isActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/40 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setIsActionSheetOpen(false)} />
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

      {/* ドロワーメニュー */}
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

              <nav className="mt-6 space-y-3">
                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    setIsQrModalOpen(true);
                  }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  <QrCode className="w-5 h-5 text-zinc-500" />
                  <span>参加用QRコード</span>
                </button>

                <a
                  href={`/${eventId}/projector`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  <Monitor className="w-5 h-5 text-indigo-500" />
                  <span>プロジェクター投影画面</span>
                </a>

                <button
                  onClick={() => {
                    setIsDrawerOpen(false);
                    if (isHostMode) {
                      handleLogoutHost();
                    } else {
                      setIsPinModalOpen(true);
                    }
                  }}
                  className="flex items-center space-x-3 text-zinc-700 w-full py-2.5 px-2 text-left font-medium active:bg-zinc-50 rounded-xl"
                >
                  {isHostMode ? (
                    <>
                      <Unlock className="w-5 h-5 text-amber-500" />
                      <span>ホスト管理を終了</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5 text-zinc-500" />
                      <span>ホスト管理設定</span>
                    </>
                  )}
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

      {/* ホストPIN認証モーダル */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl space-y-4">
            <div className="text-center">
              <Lock className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <h3 className="font-bold text-zinc-800 text-base">ホスト管理認証</h3>
              <p className="text-xs text-zinc-400 mt-1">4桁のホストPINを入力してください</p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PINコード (初期: 1234)"
                className="w-full text-center tracking-widest text-2xl font-bold py-3 bg-zinc-100 rounded-2xl border-none focus:ring-2 focus:ring-zinc-800"
                autoFocus
              />

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="w-1/2 py-3 text-sm font-medium text-zinc-500 bg-zinc-100 rounded-2xl"
                >
                  閉じる
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 text-sm font-medium text-white bg-zinc-900 rounded-2xl shadow"
                >
                  ロック解除
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QRコード＆URL共有モーダル */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl text-center space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-zinc-800 text-sm">会場配布用QRコード</h3>
              <button onClick={() => setIsQrModalOpen(false)} className="p-1 text-zinc-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-zinc-50 rounded-2xl flex justify-center">
              {/* QRコード画像API */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  typeof window !== 'undefined' ? window.location.href : ''
                )}`}
                alt="QR Code"
                className="w-48 h-48 rounded-lg"
              />
            </div>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.href);
                  alert('URLをコピーしました！');
                }
              }}
              className="w-full py-3 bg-zinc-900 text-white rounded-2xl text-xs font-medium flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Copy className="w-4 h-4" />
              <span>参加URLをコピー</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
