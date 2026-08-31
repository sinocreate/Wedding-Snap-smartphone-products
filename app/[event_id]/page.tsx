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

  const onTouchStart = (e: React.TouchEvent)
