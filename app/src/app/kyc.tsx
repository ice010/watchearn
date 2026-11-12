import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, type User } from '@/lib/api';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';

type IdType = 'passport' | 'national_id' | 'drivers_license';
type Shot = { uri: string; data: string };
type KycInfo = { status: User['kyc_status']; challenge: string; submission: { status: string; reviewer_note: string | null } | null };

const ID_LABELS: Record<IdType, string> = { national_id: 'National ID', passport: 'Passport', drivers_license: "Driver's licence" };
const STEPS = ['Details', 'ID photos', 'Selfie', 'Review'];

async function capture(camera: 'front' | 'back', fromLibrary = false): Promise<Shot | null> {
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.6,
    base64: true,
    cameraType: camera === 'front' ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  };
  if (!fromLibrary) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed to verify your identity');
  }
  const r = fromLibrary ? await ImagePicker.launchImageLibraryAsync(opts) : await ImagePicker.launchCameraAsync(opts);
  if (r.canceled) return null;
  const a = r.assets[0];
  const data = a.base64 || (a.uri.startsWith('data:') ? a.uri.split(',')[1] : '');
  if (!data) throw new Error('Could not read the photo, please try again');
  return { uri: a.uri, data };
}

export default function Kyc() {
  const { user, setUser, logout } = useSession();
  const [info, setInfo] = useState<KycInfo | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ fullName: user?.name ?? '', dateOfBirth: '', country: '', idNumber: '' });
  const [idType, setIdType] = useState<IdType>('national_id');
  const [shots, setShots] = useState<{ front?: Shot; back?: Shot; selfie?: Shot }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<KycInfo>('/kyc').then(setInfo).catch((e) => setError(e.message));
  }, []);

  if (!user) return <Redirect href="/login" />;
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const take = async (key: 'front' | 'back' | 'selfie', fromLibrary = false) => {
    setError(null);
    try {
      const shot = await capture(key === 'selfie' ? 'front' : 'back', fromLibrary);
      if (shot) setShots((s) => ({ ...s, [key]: shot }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const detailsOk = form.fullName.trim().length >= 3 && /^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) && /^[A-Za-z]{2}$/.test(form.country) && form.idNumber.trim().length >= 4;
  const photosOk = !!shots.front && (idType === 'passport' || !!shots.back);
  const canNext = [detailsOk, photosOk, !!shots.selfie, true][step];

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ user: User }>('/kyc', {
        body: { ...form, country: form.country.toUpperCase(), idType, front: shots.front!.data, back: idType === 'passport' ? undefined : shots.back?.data, selfie: shots.selfie!.data },
      });
      setUser(r.user);
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (user.kyc_status === 'pending' || user.kyc_status === 'approved') {
    return (
      <SafeAreaView style={[styles.safe, { justifyContent: 'center', padding: 24, gap: 16 }]}>
        <Ionicons name={user.kyc_status === 'approved' ? 'shield-checkmark' : 'time'} size={64} color={user.kyc_status === 'approved' ? C.accent : C.gold} style={{ alignSelf: 'center' }} />
        <Text style={styles.h1}>{user.kyc_status === 'approved' ? 'Identity verified' : 'Verification in review'}</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          {user.kyc_status === 'approved' ? 'You can cash out your earnings.' : 'We usually review documents within 24 hours. You can start watching and earning now.'}
        </Text>
        <Pressable style={styles.cta} onPress={() => router.replace('/')}><Text style={styles.ctaText}>Continue</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Verify your identity</Text>
        <Text style={[styles.muted, { textAlign: 'center' }]}>Required for every new account to keep payouts safe. Takes about 2 minutes.</Text>
        {info?.status === 'rejected' && (
          <Text style={styles.rejected}>Your last submission was rejected{info.submission?.reviewer_note ? `: ${info.submission.reviewer_note}` : ''}. Please try again.</Text>
        )}

        <View style={styles.stepper}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View style={[styles.dot, i <= step && { backgroundColor: C.accent, borderColor: C.accent }]}>
                <Text style={{ color: i <= step ? '#000' : C.muted, fontWeight: '800', fontSize: 12 }}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepLabel, i === step && { color: C.text }]}>{s}</Text>
            </View>
          ))}
        </View>

        {step === 0 && (
          <View style={styles.card}>
            <Text style={styles.label}>Document type</Text>
            <View style={styles.row}>
              {(Object.keys(ID_LABELS) as IdType[]).map((t) => (
                <Pressable key={t} onPress={() => setIdType(t)} style={[styles.chip, idType === t && styles.chipOn]}>
                  <Text style={[styles.chipText, idType === t && { color: '#000' }]}>{ID_LABELS[t]}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="Full name (as on the document)" value={form.fullName} onChangeText={set('fullName')} placeholder="Jane Doe" />
            <Field label="Date of birth (YYYY-MM-DD)" value={form.dateOfBirth} onChangeText={set('dateOfBirth')} placeholder="1995-04-01" keyboardType="numbers-and-punctuation" maxLength={10} />
            <Field label="Issuing country (2-letter code)" value={form.country} onChangeText={set('country')} placeholder="TZ, KE, NG, US…" autoCapitalize="characters" maxLength={2} />
            <Field label="Document number" value={form.idNumber} onChangeText={set('idNumber')} placeholder="A1234567" autoCapitalize="characters" />
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: 12 }}>
            <Text style={styles.muted}>Place the document on a flat surface. Make sure all four corners are visible, with no glare or blur.</Text>
            <ShotBox title={`${ID_LABELS[idType]}, ${idType === 'passport' ? 'photo page' : 'front'}`} shot={shots.front} onCamera={() => take('front')} onLibrary={() => take('front', true)} />
            {idType !== 'passport' && <ShotBox title={`${ID_LABELS[idType]}, back`} shot={shots.back} onCamera={() => take('back')} onLibrary={() => take('back', true)} />}
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: 12 }}>
            <View style={styles.challenge}>
              <Ionicons name="happy-outline" size={28} color={C.gold} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.gold, fontWeight: '800' }}>Liveness check</Text>
                <Text style={{ color: C.text }}>Take a selfie while you: <Text style={{ fontWeight: '900' }}>{info?.challenge ?? '…'}</Text></Text>
              </View>
            </View>
            <Text style={styles.muted}>Face the camera in good light. Remove hats and sunglasses. Your face must match your ID photo.</Text>
            <ShotBox title="Selfie" round shot={shots.selfie} onCamera={() => take('selfie')} />
          </View>
        )}

        {step === 3 && (
          <View style={styles.card}>
            <Text style={styles.label}>{ID_LABELS[idType]} · {form.country.toUpperCase()} · {form.idNumber.toUpperCase()}</Text>
            <Text style={{ color: C.text, fontWeight: '700' }}>{form.fullName} · born {form.dateOfBirth}</Text>
            <View style={[styles.row, { marginTop: 8 }]}>
              {[shots.front, shots.back, shots.selfie].filter(Boolean).map((s, i) => (
                <Image key={i} source={{ uri: s!.uri }} style={styles.thumb} />
              ))}
            </View>
            <Text style={[styles.muted, { marginTop: 8 }]}>By submitting, you confirm the document is yours and agree that we may process it to verify your identity and prevent fraud.</Text>
          </View>
        )}

        {error && <Text style={{ color: C.danger }}>{error}</Text>}

        <View style={[styles.row, { marginTop: 8 }]}>
          {step > 0 && (
            <Pressable style={[styles.cta, styles.secondary]} onPress={() => setStep(step - 1)}><Text style={[styles.ctaText, { color: C.text }]}>Back</Text></Pressable>
          )}
          <Pressable
            style={[styles.cta, { flex: 1 }, (!canNext || busy) && { opacity: 0.5 }]}
            disabled={!canNext || busy}
            onPress={() => (step < 3 ? setStep(step + 1) : submit())}>
            {busy ? <ActivityIndicator color="#000" /> : <Text style={styles.ctaText}>{step < 3 ? 'Next' : 'Submit for review'}</Text>}
          </Pressable>
        </View>
        <Pressable onPress={logout}><Text style={[styles.muted, { textAlign: 'center', marginTop: 12 }]}>Sign out</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor="#555" style={styles.input} {...props} />
    </View>
  );
}

function ShotBox({ title, shot, round, onCamera, onLibrary }: { title: string; shot?: Shot; round?: boolean; onCamera: () => void; onLibrary?: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={{ color: C.text, fontWeight: '700' }}>{title}</Text>
      <Pressable onPress={onCamera} style={[styles.frame, round && styles.frameRound]}>
        {shot ? (
          <Image source={{ uri: shot.uri }} style={[styles.preview, round && { borderRadius: 999 }]} resizeMode="cover" />
        ) : (
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Ionicons name={round ? 'person-circle-outline' : 'card-outline'} size={44} color={C.muted} />
            <Text style={styles.muted}>Tap to {round ? 'take a selfie' : 'take a photo'}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.row}>
        <Pressable onPress={onCamera}><Text style={styles.link}>{shot ? 'Retake' : 'Open camera'}</Text></Pressable>
        {onLibrary && <Pressable onPress={onLibrary}><Text style={styles.link}>Upload instead</Text></Pressable>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 14, paddingBottom: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
  h1: { color: C.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: C.muted, fontSize: 13 },
  rejected: { color: C.danger, borderWidth: 1, borderColor: C.danger, borderRadius: 10, padding: 10 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  dot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { color: C.muted, fontSize: 11 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: C.border },
  label: { color: C.muted, fontSize: 13, marginBottom: 4 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' },
  chip: { flexGrow: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontWeight: '700', fontSize: 13 },
  input: { backgroundColor: C.bg, color: C.text, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  frame: { height: 190, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frameRound: { width: 220, height: 220, borderRadius: 110, alignSelf: 'center' },
  preview: { width: '100%', height: '100%' },
  challenge: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: C.gold, borderRadius: 12, padding: 12 },
  thumb: { width: 90, height: 90, borderRadius: 10, backgroundColor: C.bg },
  cta: { backgroundColor: C.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
  secondary: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24 },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16 },
  link: { color: C.accent, fontWeight: '700', padding: 4 },
});
