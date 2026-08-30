'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  ImagePlus,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Star,
  Monitor,
  Lock,
  Unlock,
  QrCode,
  Copy,
  ChevronLeft,
  ChevronRight,
  Archive,
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
const supabase = createClient(supabaseUrl, supabaseAnonKey || 'placeholder', {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

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
      if (!ctx) return resolve(file);
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
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isHostMode, setIsHostMode] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  // 1. ユーザーID ＆ DBからいいね状態を直接復元
  useEffect(() => {
    let localUserId = localStorage.getItem('wedding_guest_uuid');
    if (!localUserId) {
      localUserId = crypto.randomUUID();
      localStorage.setItem('wedding_guest_uuid', localUserId);
    }
    setUserId(localUserId);

    const cachedSaves = localStorage.getItem(`saves_${eventId}`);
    if (cachedSaves) setSavedPhotoIds(JSON.parse(cachedSaves));

    const hostSession = sessionStorage.getItem(`host_auth_${eventId}`);
    if (hostSession === 'true') setIsHostMode(true);

    const loadUserLikes = async () => {
      const { data, error } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('event_id', eventId)
        .eq('user_id', localUserId);

      if (!error && data) {
        const likedIds = data.map((item) => String(item.photo_id));
        setMyLikedPhotoIds(likedIds);
        localStorage.setItem(`likes_${eventId}`, JSON.stringify(likedIds));
      }
    };
    loadUserLikes();
  }, [eventId]);

  // 2. 写真一覧取得 ＆ Realtime同期
  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

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
      .channel(`wedding_realtime_${eventId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        (payload) => {
          const newRow = payload.new as Photo;
          const oldRow = payload.old as Photo;

          if (payload.eventType === 'INSERT') {
            if (newRow && newRow.event_id === eventId) {
              setPhotos((prev) => {
                const exists = prev.some((p) => p.id === newRow.id);
                return exists ? prev : [newRow, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            if (newRow && newRow.event_id === eventId) {
              setPhotos((prev) =>
                prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              setPhotos((prev) => prev.filter((p) => p.id !== oldRow.id));
            }
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
  const toggleLike = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const isLiked = myLikedPhotoIds.includes(photoId);

    if (!isLiked && myLikedPhotoIds.length >= 3) {
      alert('いいねは1人最大3枚までです！');
      return;
    }

    const nextLikes = isLiked
      ? myLikedPhotoIds.filter((id) => id !== photoId)
      : [...myLikedPhotoIds, photoId];

    setMyLikedPhotoIds(nextLikes);
    localStorage.setItem(`likes_${eventId}`, JSON.stringify(nextLikes));

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
      const { data, error } = await supabase.rpc('toggle_photo_like_safe', {
        p_event_id: eventId,
        p_photo_id: photoId,
        p_user_id: userId,
      });

      if (error) {
        if (isLiked) {
          await supabase.from('photo_likes').delete().eq('photo_id', photoId).eq('user_id', userId);
        } else {
          await supabase.from('photo_likes').insert({ event_id: eventId, photo_id: photoId, user_id: userId });
        }
      } else if (data && typeof data.likes_count === 'number') {
        setPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, likes_count: data.likes_count } : p))
        );
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

  // 5. 画像保存
  const handleDownload = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
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

    try {
      setIsUploading(true);
      setIsActionSheetOpen(false);

      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const thumbFileName = `thumb_${eventId}_${timestamp}_${rand}.jpg`;
      const originalFileName = `hd_${eventId}_${timestamp}_${rand}.jpg`;

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

            await supabase
              .from('photos')
              .update({
                original_url: hdPublicUrl,
                public_url: hdPublicUrl,
                is_hd_ready: true,
              })
              .eq('id', insertedPhoto.id);
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

  // 7. ホスト専用操作
  const handleTogglePickup = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !photo.is_pickup;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_pickup: newStatus } : p)));
    await supabase.from('photos').update({ is_pickup: newStatus }).eq('id', photo.id);
  };

  const handleDeletePhoto = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('この写真を削除しますか？（復元できません）')) return;

    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (previewIndex !== null) setPreviewIndex(null);
    await supabase.from('photos').delete().eq('id', photo.id);
  };

  const handleDownloadAllZip = async () => {
    if (photos.length === 0) {
      alert('ダウンロード可能な写真がありません');
      return;
    }
    if (!confirm(`全 ${photos.length} 枚の高画質写真をZIP形式で一括保存しますか？`)) return;

    try {
      setIsZipping(true);
      setZipProgress(0);

      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.body.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const JSZip = (window as any).JSZip;
      const zip = new JSZip();
      const folder = zip.folder(`wedding_photos_${eventId}`);

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const targetUrl = photo.original_url || photo.public_url;
        try {
          const res = await fetch(targetUrl);
          const blob = await res.blob();
          folder.file(`photo_${i + 1}_${photo.id.slice(0, 6)}.jpg`, blob);
        } catch (e) {
          console.error('Fetch error for zip:', photo.id, e);
        }
        setZipProgress(Math.round(((i + 1) / photos.length) * 100));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${eventData.title}_photos.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      alert('ZIPファイルのダウンロードが完了しました！');
    } catch (err) {
      alert('ZIPの作成に失敗しました');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

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

  const currentPreviewPhoto = previewIndex !== null ? filteredPhotos[previewIndex] : null;

  const handlePrevPreview = useCallback(() => {
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : filteredPhotos.length - 1));
  }, [previewIndex, filteredPhotos.length]);

  const handleNextPreview = useCallback(() => {
    if (previewIndex === null) return;
    setPreviewIndex((prev) => (prev !== null && prev < filteredPhotos.length - 1 ? prev + 1 : 0));
  }, [previewIndex, filteredPhotos.length]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 40) handleNextPreview();
    if (distance < -40) handlePrevPreview();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  return (
    <div className="min-h-screen bg-[#F0EFEB] flex justify-center selection:bg-zinc-200">
      <main className="w-full max-w-md min-h-screen bg-white relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6rem)] overflow-y-auto overflow-x-hidden">
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

        <header className="sticky top-0 z-40 w-full bg-zinc-100/90 backdrop-blur-sm border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
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

        <section className="flex justify-between items-center w-full px-6 py-4">
          <button
            onClick={() => setActiveFilter(activeFilter === 'ranking' ? null : 'ranking')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'ranking' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Ranking
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'pickup' ? null : 'pickup')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'pickup' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <Sparkles className="w-5 h-5 text-indigo-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              Pickup
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}
            className={`w-[26%] max-w-[90px] aspect-square rounded-full bg-white shadow flex flex-col items-center justify-center transition-transform active:scale-95 transform-gpu ${
              activeFilter === 'mine' ? 'ring-2 ring-zinc-800 ring-offset-2 scale-105' : ''
            }`}
          >
            <User className="w-5 h-5 text-emerald-500 mb-1" strokeWidth={1.5} />
            <span className="text-[clamp(0.7rem,2.8vw,0.85rem)] font-medium text-zinc-700">
              mine
            </span>
          </button>
        </section>

        {filteredPhotos.length =
