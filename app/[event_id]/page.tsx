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
  UserCheck,
  Printer,
  EyeOff,
  AlertCircle,
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
  is_hd_ready?: boolean;
  user_id: string;
  user_name?: string;
  likes_count: number;
  is_pickup: boolean;
  is_hidden?: boolean;
  created_at: string;
}

interface EventData {
  id: string;
  title: string;
  host_pin: string;
  is_locked?: boolean;
}

type FilterType = 'ranking' | 'pickup' | 'mine' | null;

const createThumbnailBlob = (file: File, maxDimension = 600, quality = 0.75): Promise<Blob> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(file);
    const img = document.createElement('img');
    img.onload = () => {
      let width = img.width;
      let height = img.height;
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

  const [eventData, setEventData] = useState<EventData>({ id: eventId, title: 'Wedding Snap', host_pin: '1234', is_locked: false });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [tempNameInput, setTempNameInput] = useState('');
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  const [myLikedPhotoIds, setMyLikedPhotoIds] = useState<string[]>([]);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [bouncingLikeId, setBouncingLikeId] = useState<string | null>(null);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isHostMode, setIsHostMode] = useState(false);
  const [pinInput, setPinInput] = useState('');

  const touchStartX = useRef<number>(0);
  const touchStartTime = useRef<number>(0);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const fetchAllData = useCallback(async (currentUid: string) => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const { data: eventRow } = await supabase.from('events').select('*').eq('id', eventId).single();
    if (eventRow) setEventData(eventRow);

    const { data: photosData } = await supabase
      .from('photos')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (photosData) setPhotos(photosData as Photo[]);

    if (currentUid) {
      const { data: likesData } = await supabase
        .from('photo_likes')
        .select('photo_id')
        .eq('event_id', eventId)
        .eq('user_id', currentUid);

      if (likesData) {
        const likedIds = likesData.map((item) => String(item.photo_id));
        setMyLikedPhotoIds(likedIds);
        localStorage.setItem(`likes_${eventId}`, JSON.stringify(likedIds));
      }
    }
  }, [eventId]);

  useEffect(() => {
    let localUserId = localStorage.getItem('wedding_guest_uuid');
    if (!localUserId) {
      localUserId = crypto.randomUUID();
      localStorage.setItem('wedding_guest_uuid', localUserId);
    }
    setUserId(localUserId);

    const savedName = localStorage.getItem('wedding_guest_name') || '';
    setUserName(savedName);

    const cachedSaves = localStorage.getItem(`saves_${eventId}`);
    if (cachedSaves) {
      try {
        setSavedPhotoIds(JSON.parse(cachedSaves));
      } catch {
        setSavedPhotoIds([]);
      }
    }

    const hostSession = sessionStorage.getItem(`host_auth_${eventId}`);
    if (hostSession === 'true') setIsHostMode(true);

    fetchAllData(localUserId);
  }, [eventId, fetchAllData]);

  useEffect(() => {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder')) return;

    const channel = supabase
      .channel(`sync_room_${eventId}`)
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
              setPhotos((prev) => prev.map((p) => (p.id === newRow.id ? { ...p, ...newRow } : p)));
            }
          } else if (payload.eventType === 'DELETE') {
            if (oldRow && oldRow.id) {
              setPhotos((prev) => prev.filter((p) => p.id !== oldRow.id));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        (payload) => {
          const newEvt = payload.new as EventData;
          if (newEvt && newEvt.id === eventId) {
            setEventData((prev) => ({ ...prev, ...newEvt }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  const filteredPhotos = useMemo(() => {
    let result = photos.filter((p) => isHostMode || !p.is_hidden);
    if (activeFilter === 'ranking') {
      result.sort((a, b) => b.likes_count - a.likes_count);
    } else if (activeFilter === 'pickup') {
      return result.filter((p) => p.is_pickup);
    } else if (activeFilter === 'mine') {
      return result.filter((p) => p.user_id === userId);
    }
    return result;
  }, [photos, activeFilter, userId, isHostMode]);

  const toggleLike = async (photoId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (eventData.is_locked) {
      alert('現在、いいねの投票は締め切られています');
      return;
    }

    const isLiked = myLikedPhotoIds.includes(photoId);

    if (!isLiked && myLikedPhotoIds.length >= 3) {
      alert('いいねは1人最大3枚までです！');
      return;
    }

    setBouncingLikeId(photoId);
    setTimeout(() => setBouncingLikeId(null), 300);

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
      if (isLiked) {
        await supabase
          .from('photo_likes')
          .delete()
          .eq('event_id', eventId)
          .eq('photo_id', photoId)
          .eq('user_id', userId);
      } else {
        await supabase
          .from('photo_likes')
          .insert({ event_id: eventId, photo_id: photoId, user_id: userId });
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  };

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

  const executeUpload = async (file: File, nameToUse: string) => {
    if (!file.type.startsWith('image/')) {
      alert('画像ファイル（JPEG / PNG / WEBP / HEIC 等）のみアップロード可能です');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      alert('写真のサイズが大きすぎます（15MB以下にしてください）');
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgressText('最適化中...');
      setIsActionSheetOpen(false);

      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 8);
      const thumbFileName = `thumb_${eventId}_${timestamp}_${rand}.jpg`;
      const originalFileName = `hd_${eventId}_${timestamp}_${rand}.jpg`;

      const thumbBlob = await createThumbnailBlob(file, 600, 0.75);

      setUploadProgressText('送信中...');
      const { data: thumbData, error: thumbError } = await supabase.storage
        .from('wedding-photos')
        .upload(thumbFileName, thumbBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (thumbError) throw new Error(`送信失敗: ${thumbError.message}`);

      const { data: { publicUrl: thumbPublicUrl } } = supabase.storage.from('wedding-photos').getPublicUrl(thumbData.path);

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
          user_name: nameToUse || 'ゲスト',
          likes_count: 0,
          is_pickup: false,
          is_hidden: false,
        })
        .select()
        .single();

      if (dbError) throw new Error(`DB保存失敗: ${dbError.message}`);

      setIsUploading(false);
      setUploadProgressText('');

      (async () => {
        try {
          const { data: hdData, error: hdError } = await supabase.storage
            .from('wedding-photos')
            .upload(originalFileName, file, {
              contentType: file.type || 'image/jpeg',
              upsert: true,
            });

          if (!hdError && hdData) {
            const { data: { publicUrl: hdPublicUrl } } = supabase.storage.from('wedding-photos').getPublicUrl(hdData.path);
            await supabase
              .from('photos')
              .update({ original_url: hdPublicUrl, public_url: hdPublicUrl, is_hd_ready: true })
              .eq('id', insertedPhoto.id);
          }
        } catch (bgErr) {
          console.error('HD Upload Error:', bgErr);
        }
      })();
    } catch (err: any) {
      alert(err.message || 'アップロードに失敗しました');
      setIsUploading(false);
      setUploadProgressText('');
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (albumInputRef.current) albumInputRef.current.value = '';
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!userName.trim()) {
      setPendingUploadFile(file);
      setIsNameModalOpen(true);
      setIsActionSheetOpen(false);
    } else {
      executeUpload(file, userName);
    }
  };

  const handleSaveNameAndUpload = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = tempNameInput.trim() || 'ゲスト';
    setUserName(finalName);
    localStorage.setItem('wedding_guest_name', finalName);
    setIsNameModalOpen(false);

    if (pendingUploadFile) {
      executeUpload(pendingUploadFile, finalName);
      setPendingUploadFile(null);
    }
  };

  const handleToggleLock = async () => {
    const nextLocked = !eventData.is_locked;
    setEventData((prev) => ({ ...prev, is_locked: nextLocked }));
    await supabase.from('events').update({ is_locked: nextLocked }).eq('id', eventId);
  };

  const handleTogglePickup = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newStatus = !photo.is_pickup;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_pickup: newStatus } : p)));
    await supabase.from('photos').update({ is_pickup: newStatus }).eq('id', photo.id);
  };

  const handleToggleHide = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const newHidden = !photo.is_hidden;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_hidden: newHidden } : p)));
    await supabase.from('photos').update({ is_hidden: newHidden }).eq('id', photo.id);
  };

  const handleDeletePhoto = async (photo: Photo, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('この写真を削除しますか？（復元できません）')) return;
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    if (previewIndex !== null) setPreviewIndex(null);
    await supabase.from('photos').delete().eq('id', photo.id);
  };

  const handleDownloadAllZip = async () => {
    if (photos.length === 0) return alert('ダウンロード可能な写真がありません');
    if (!confirm(`全 ${photos.length} 枚の高画質写真をZIP形式で一括保存しますか？`)) return;

    try {
      setIsZipping(true);
      setZipProgress(0);

      if (typeof window !== 'undefined' && !(window as any).JSZip) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        document.body.appendChild(script);
        await new Promise((resolve) => { script.onload = resolve; });
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
          const uploader = photo.user_name ? `_${photo.user_name}` : '';
          folder.file(`photo_${i + 1}${uploader}_${photo.id.slice(0, 6)}.jpg`, blob);
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
    } catch {
      alert('ZIPの作成に失敗しました');
    } finally {
      setIsZipping(false);
      setZipProgress(0);
    }
  };

  const handleGenerateQrCard = () => {
    if (typeof window === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1600;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 12;
    ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

    ctx.fillStyle = '#18181B';
    ctx.font = 'italic 72px "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('Wedding Photo Share', 600, 260);

    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#3F3F46';
    ctx.fillText(eventData.title, 600, 360);

    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#71717A';
    ctx.fillText('本日はご列席いただき誠にありがとうございます', 600, 460);
    ctx.fillText('皆さまが撮影した素敵な写真をぜひ共有してください', 600, 520);

    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(window.location.href)}`;
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 350, 640, 500, 500);

      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#18181B';
      ctx.fillText('QRコードをスマホのカメラで読み取って参加', 600, 1260);

      ctx.font = '28px sans-serif';
      ctx.fillStyle = '#A1A1AA';
      ctx.fillText('アプリのインストールや面倒な登録は不要です', 600, 1340);

      const cardUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      link.href = cardUrl;
      link.download = `table_card_${eventId}.jpg`;
      link.click();
      alert('卓上案内カードの画像をダウンロードしました！\n印刷してテーブルに飾っていただけます。');
    };
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

  const currentPhoto = previewIndex !== null ? filteredPhotos[previewIndex] : null;

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
    touchStartTime.current = Date.now();
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX;
    const diffX = endX - touchStartX.current;
    const diffTime = Date.now() - touchStartTime.current;

    if (diffTime < 350 && Math.abs(diffX) > 30) {
      if (diffX < 0) handleNextPreview();
      else handlePrevPreview();
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5F0] flex justify-center selection:bg-amber-100 font-sans antialiased text-zinc-800">
      <main className="w-full max-w-md min-h-screen bg-[#FDFCFB] relative shadow-2xl pb-[calc(env(safe-area-inset-bottom)+6.5rem)] overflow-y-auto overflow-x-hidden border-x border-black/[0.04]">
        {/* ホストモード稼働中バナー */}
        {isHostMode && (
          <div className="sticky top-0 z-50 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 text-xs font-bold px-4 py-1.5 flex items-center justify-between shadow-md">
            <span className="flex items-center space-x-1.5">
              <Unlock className="w-3.5 h-3.5" />
              <span>ホスト管理者モード中</span>
            </span>
            <button onClick={handleLogoutHost} className="underline text-[11px] font-bold">
              終了
            </button>
          </div>
        )}

        {/* 投票締め切り告知バナー */}
        {eventData.is_locked && (
          <div className="bg-zinc-900 text-amber-300 text-xs font-bold px-4 py-2 flex items-center justify-center space-x-1.5 text-center shadow-md">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>いいね投票は締め切られました（閲覧・保存は可能です）</span>
          </div>
        )}

        {/* エレガント固定ヘッダー */}
        <header className="sticky top-0 z-40 w-full bg-[#FDFCFB]/90 backdrop-blur-md border-b border-black/[0.05] px-5 py-3.5 flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
          <div className="w-6" />
          <h1 className="font-serif italic text-[clamp(1.2rem,4.8vw,1.45rem)] tracking-wider text-zinc-900 select-none font-medium text-center">
            {eventData.title}
          </h1>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="text-zinc-700 hover:text-zinc-950 p-1.5 rounded-full hover:bg-black/5 active:scale-90 transition"
            aria-label="メニューを開く"
          >
            <Menu className="w-6 h-6" strokeWidth={1.5} />
          </button>
        </header>

        {/* 3大円形ナビゲーション */}
        <section className="flex justify-between items-center w-full px-6 py-4">
          <button
            onClick={() => setActiveFilter(activeFilter === 'ranking' ? null : 'ranking')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'ranking'
                ? 'border-amber-500 ring-2 ring-amber-500/20 shadow-md bg-amber-50/30'
                : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <Trophy className="w-5 h-5 text-amber-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">
              Ranking
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'pickup' ? null : 'pickup')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'pickup'
                ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md bg-indigo-50/30'
                : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <Sparkles className="w-5 h-5 text-indigo-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">
              Pickup
            </span>
          </button>

          <button
            onClick={() => setActiveFilter(activeFilter === 'mine' ? null : 'mine')}
            className={`w-[27%] max-w-[94px] aspect-square rounded-2xl bg-white flex flex-col items-center justify-center transition-all duration-200 active:scale-95 border ${
              activeFilter === 'mine'
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md bg-emerald-50/30'
                : 'border-black/[0.06] shadow-sm hover:shadow'
            }`}
          >
            <User className="w-5 h-5 text-emerald-500 mb-1" strokeWidth={1.7} />
            <span className="text-[clamp(0.72rem,2.9vw,0.85rem)] font-bold text-zinc-700 tracking-tight">
              mine
            </span>
          </button>
        </section>

        {/* 洗練されたフォトギャラリー */}
        {filteredPhotos.length === 0 ? (
          <div className="w-full px-3">
            <div className="grid grid-cols-3 gap-2.5 w-full">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="w-full aspect-square rounded-2xl bg-black/[0.02] border border-dashed border-black/[0.08] flex flex-col items-center justify-center text-zinc-300"
                >
                  <Camera className="w-6 h-6 opacity-30 mb-1" strokeWidth={1.5} />
                  <span className="text-[10px] opacity-40 font-mono">#{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="py-14 text-center px-4">
              <p className="text-sm font-bold text-zinc-700 mb-1">写真がまだありません</p>
              <p className="text-xs text-zinc-400">
                右下の「投稿する」ボタンから最初の想い出をシェアしてください
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 px-3 py-1 w-full">
            {filteredPhotos.map((photo, index) => {
              const isLiked = myLikedPhotoIds.includes(photo.id);
              const isSaved = savedPhotoIds.includes(photo.id);
              const displayUrl = photo.thumb_url || photo.public_url;
              const isBouncing = bouncingLikeId === photo.id;

              return (
                <div
                  key={photo.id}
                  onClick={() => setPreviewIndex(index)}
                  className="w-full aspect-square relative rounded-2xl overflow-hidden bg-zinc-100 cursor-pointer select-none active:scale-[0.97] transition-all duration-200 shadow-sm hover:shadow border border-black/[0.04]"
                >
                  <img
                    src={displayUrl}
                    alt="Wedding photo"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />

                  <div className="absolute bottom-1.5 left-1.5 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded-full flex items-center space-x-1 z-10 pointer-events-none">
                    <span className="text-[10px] font-bold text-white">
                      {photo.likes_count}
                    </span>
                  </div>

                  {photo.is_pickup && (
                    <div className="absolute top-1.5 left-1.5 z-10 pointer-events-none drop-shadow-md">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    </div>
                  )}

                  {photo.is_hidden && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-red-600/90 backdrop-blur-sm text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow">
                      非表示中
                    </div>
                  )}

                  {isHostMode && photo.user_name && !photo.is_hidden && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[9px] text-amber-300 font-bold max-w-[80%] truncate shadow-sm">
                      {photo.user_name}
                    </div>
                  )}

                  <button
                    onClick={(e) => toggleLike(photo.id, e)}
                    className={`absolute bottom-1.5 right-1.5 z-20 p-1.5 rounded-full bg-black/30 backdrop-blur-md transition-transform duration-200 ${
                      isBouncing ? 'scale-135' : 'active:scale-125'
                    }`}
                    aria-label="いいね"
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        isLiked
                          ? 'fill-rose-500 text-rose-500'
                          : 'text-white'
                      }`}
                    />
                  </button>

                  {isSaved && (
                    <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none drop-shadow">
                      <CheckCircle2 className="w-4 h-4 fill-emerald-500 text-white" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 全画面プレビューモーダル */}
      {currentPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none animate-in fade-in duration-150"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-full z-20 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-4 flex items-center justify-between text-white">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold text-zinc-300 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md border border-white/10">
                {previewIndex! + 1} / {filteredPhotos.length}
              </span>
              {isHostMode && (
                <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-3 py-1 rounded-full font-bold backdrop-blur-md">
                  撮影者: {currentPhoto.user_name || 'ゲスト'} 様
                </span>
              )}
            </div>
            <button
              onClick={() => setPreviewIndex(null)}
              className="p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white active:scale-90 transition backdrop-blur-md border border-white/10"
              aria-label="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden">
            <button
              onClick={handlePrevPreview}
              className="hidden sm:flex absolute left-4 z-20 p-3.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition backdrop-blur-md border border-white/10"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <img
              key={currentPhoto.id}
              src={currentPhoto.original_url || currentPhoto.thumb_url || currentPhoto.public_url}
              alt="Full view"
              className="w-full h-full object-contain select-none animate-in zoom-in-95 duration-150"
            />

            <button
              onClick={handleNextPreview}
              className="hidden sm:flex absolute right-4 z-20 p-3.5 rounded-full bg-black/40 text-white hover:bg-black/60 transition backdrop-blur-md border border-white/10"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          <div className="w-full z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-5 pb-[calc(env(safe-area-inset-bottom)+1.8rem)] flex items-center justify-between text-white">
            <button
              onClick={() => toggleLike(currentPhoto.id)}
              className={`flex items-center space-x-2 bg-white/15 hover:bg-white/25 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 transition ${
                bouncingLikeId === currentPhoto.id ? 'scale-110' : 'active:scale-95'
              }`}
            >
              <Heart
                className={`w-5 h-5 ${
                  myLikedPhotoIds.includes(currentPhoto.id)
                    ? 'fill-rose-500 text-rose-500'
                    : 'text-zinc-200'
                }`}
              />
              <span className="font-bold text-sm text-white">{currentPhoto.likes_count}</span>
            </button>

            <button
              onClick={() => handleDownload(currentPhoto)}
              className="flex items-center space-x-1.5 px-5 py-2.5 bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md text-white rounded-2xl text-xs font-bold transition border border-white/10"
            >
              <Download className="w-4 h-4" />
              <span>{savedPhotoIds.includes(currentPhoto.id) ? '保存済み' : '高画質保存'}</span>
            </button>

            {isHostMode && (
              <div className="flex items-center space-x-2 pl-2 border-l border-white/20">
                <button
                  onClick={() => handleTogglePickup(currentPhoto)}
                  className={`p-2.5 rounded-2xl backdrop-blur-md border border-white/10 transition ${
                    currentPhoto.is_pickup
                      ? 'bg-amber-400 text-zinc-950 font-bold border-amber-300'
                      : 'bg-white/15 text-white'
                  }`}
                  title="Pickup"
                >
                  <Star className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleToggleHide(currentPhoto)}
                  className={`p-2.5 rounded-2xl backdrop-blur-md border border-white/10 transition ${
                    currentPhoto.is_hidden
                      ? 'bg-red-500 text-white'
                      : 'bg-white/15 text-white'
                  }`}
                  title={currentPhoto.is_hidden ? '非表示解除' : 'プロジェクター非表示'}
                >
                  <EyeOff className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDeletePhoto(currentPhoto)}
                  className="p-2.5 rounded-2xl bg-red-600/80 backdrop-blur-md text-white active:scale-95 transition border border-red-500/50"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 隠しインプット */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        className="hidden"
      />
      <input
        ref={albumInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelected}
        className="hidden"
      />

      {/* FAB */}
      <button
        disabled={isUploading}
        onClick={() => setIsActionSheetOpen(true)}
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-4 sm:right-[max(1rem,calc(50%-224px+1rem))] z-40 h-14 px-6 rounded-full bg-zinc-900 text-white shadow-[0_8px_25px_rgba(0,0,0,0.25)] flex items-center justify-center space-x-2 border border-zinc-700/80 active:scale-95 transition-all ${
          isUploading ? 'opacity-90' : ''
        }`}
        aria-label="写真を追加"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <span className="text-xs font-bold tracking-wide">{uploadProgressText}</span>
          </>
        ) : (
          <>
            <Camera className="w-5 h-5 text-amber-400" strokeWidth={1.8} />
            <span className="text-xs font-bold tracking-wider">投稿する</span>
          </>
        )}
      </button>

      {/* 写真追加シート */}
      {isActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end items-center bg-black/50 backdrop-blur-[2px]">
          <div className="absolute inset-0" onClick={() => setIsActionSheetOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl p-6 shadow-2xl z-10 space-y-3 pb-[calc(env(safe-area-inset-bottom)+1.8rem)] animate-in slide-in-from-bottom duration-150">
            <div className="w-10 h-1 bg-zinc-200 rounded-full mx-auto mb-2" />
            <h3 className="text-center font-serif italic text-lg text-zinc-900 mb-4">Share Your Memories</h3>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-900 text-white rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-98 transition shadow"
            >
              <Camera className="w-5 h-5 text-amber-400" />
              <span>カメラで写真を撮る</span>
            </button>

            <button
              onClick={() => albumInputRef.current?.click()}
              className="w-full py-3.5 px-4 bg-zinc-100 text-zinc-800 rounded-2xl font-bold text-sm flex items-center justify-center space-x-2 active:scale-98 transition"
            >
              <Sparkles className="w-5 h-5 text-indigo-500" />
              <span>アルバムから選ぶ</span>
            </button>

            <button
              onClick={() => setIsActionSheetOpen(false)}
              className="w-full py-3 text-zinc-400 font-medium text-xs active:text-zinc-600 transition"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* お名前入力モーダル */}
      {isNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs shadow-2xl space-y-5 border border-black/[0.04]">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 border border-amber-200/60">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-zinc-900 text-base">お名前の登録</h3>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                新郎新婦へ伝わるお名前やニックネームをご入力ください
              </p>
            </div>

            <form onSubmit={handleSaveNameAndUpload} className="space-y-4">
              <input
                type="text"
                maxLength={20}
                value={tempNameInput}
                onChange={(e) => setTempNameInput(e.target.value)}
                placeholder="例: 山田 / 新婦友人 あやか"
                className="w-full text-center text-sm font-bold py-3 bg-zinc-100 rounded-2xl border-none focus:ring-2 focus:ring-zinc-800"
                autoFocus
                required
              />

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsNameModalOpen(false);
                    setPendingUploadFile(null);
                  }}
                  className="w-1/3 py-3 text-xs font-bold text-zinc-500 bg-zinc-100 rounded-2xl"
                >
                  中止
