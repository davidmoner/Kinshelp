import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import {
  automatchAccept,
  automatchDecline,
  automatchGetSettings,
  automatchListInvites,
  automatchUpdateSettings,
} from '../api/khApi';

const AM_CATS = [
  { id: 'repairs', label: 'Reparaciones' },
  { id: 'packages', label: 'Paquetes' },
  { id: 'pets', label: 'Mascotas' },
  { id: 'cleaning', label: 'Limpieza' },
  { id: 'transport', label: 'Transporte' },
  { id: 'tech', label: 'Tecnologia' },
  { id: 'gardening', label: 'Jardineria' },
  { id: 'care', label: 'Acompanamiento' },
  { id: 'tutoring', label: 'Clases' },
  { id: 'creative', label: 'Creativo' },
  { id: 'errands', label: 'Recados' },
  { id: 'other', label: 'Otros' },
];

const SIMPLE_RADIUS = [2, 5, 10];

function pickClosestPreset(val) {
  const v = Number(val);
  if (!Number.isFinite(v)) return 5;
  return SIMPLE_RADIUS.reduce((best, cur) => (
    Math.abs(cur - v) < Math.abs(best - v) ? cur : best
  ), SIMPLE_RADIUS[0]);
}

export default function AutoMatchScreen() {
  const { token } = useAuth();
  const [booted, setBooted] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [mode, setMode] = React.useState('simple');
  const [enabled, setEnabled] = React.useState(false);
  const [seekerEnabled, setSeekerEnabled] = React.useState(false);
  const [radiusKm, setRadiusKm] = React.useState(5);
  const [simpleRadius, setSimpleRadius] = React.useState(5);
  const [maxInvites, setMaxInvites] = React.useState(20);
  const [weekdayStart, setWeekdayStart] = React.useState('17:00');
  const [weekdayEnd, setWeekdayEnd] = React.useState('21:00');
  const [weekendStart, setWeekendStart] = React.useState('00:00');
  const [weekendEnd, setWeekendEnd] = React.useState('23:59');
  const [categories, setCategories] = React.useState([]);
  const [seekerCategories, setSeekerCategories] = React.useState([]);
  const [invites, setInvites] = React.useState([]);
  const [statusFilter, setStatusFilter] = React.useState('pending');
  const [kindFilter, setKindFilter] = React.useState('all');

  const load = React.useCallback(async () => {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const s = await automatchGetSettings(token);
      const nextMode = (s && s.automatch_mode) === 'advanced' ? 'advanced' : 'simple';
      setMode(nextMode);
      setEnabled(!!s.enabled);
      setSeekerEnabled(!!s.seeker_enabled);
      const r = Number(s.radius_km || 5);
      setRadiusKm(r);
      setSimpleRadius(pickClosestPreset(r));
      setMaxInvites(Number(s.max_invites_per_day || 20));
      setWeekdayStart(s.weekday_start || '17:00');
      setWeekdayEnd(s.weekday_end || '21:00');
      setWeekendStart(s.weekend_start || '00:00');
      setWeekendEnd(s.weekend_end || '23:59');
      setCategories(Array.isArray(s.categories) ? s.categories : []);
      setSeekerCategories(Array.isArray(s.seeker_categories) ? s.seeker_categories : []);

      const inv = await automatchListInvites(token, { limit: 40, offset: 0 });
      setInvites((inv && inv.data) || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setBooted(true);
    }
  }, [token]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleCat = (catId, forSeeker) => {
    if (forSeeker) {
      setSeekerCategories(prev => prev.includes(catId)
        ? prev.filter(c => c !== catId)
        : [...prev, catId]);
      return;
    }
    setCategories(prev => prev.includes(catId)
      ? prev.filter(c => c !== catId)
      : [...prev, catId]);
  };

  const saveSimple = async () => {
    if (!token) return;
    if (!enabled && !seekerEnabled) {
      setError(new Error('Elige recibir u ofrecer ayuda.'));
      return;
    }
    setSaving(true);
    setError(null);
    const tz_offset_min = new Date().getTimezoneOffset();
    const allCats = AM_CATS.map(c => c.id);
    try {
      await automatchUpdateSettings(token, {
        automatch_mode: 'simple',
        enabled,
        seeker_enabled: seekerEnabled,
        categories: enabled ? allCats : [],
        seeker_categories: seekerEnabled ? allCats : [],
        radius_km: simpleRadius,
        max_invites_per_day: 20,
        weekday_start: '17:00',
        weekday_end: '21:00',
        weekend_start: '00:00',
        weekend_end: '23:59',
        tz_offset_min,
      });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const saveAdvanced = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    const tz_offset_min = new Date().getTimezoneOffset();
    const radius = Math.max(1, Math.min(30, Number(radiusKm) || 5));
    const invites = Math.max(1, Math.min(20, Number(maxInvites) || 20));
    try {
      await automatchUpdateSettings(token, {
        automatch_mode: 'advanced',
        enabled,
        seeker_enabled: seekerEnabled,
        categories,
        seeker_categories: seekerCategories,
        radius_km: radius,
        max_invites_per_day: invites,
        weekday_start: weekdayStart || '17:00',
        weekday_end: weekdayEnd || '21:00',
        weekend_start: weekendStart || '00:00',
        weekend_end: weekendEnd || '23:59',
        tz_offset_min,
      });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  const onAccept = async (inviteId) => {
    if (!token) return;
    try {
      await automatchAccept(token, inviteId);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const onDecline = async (inviteId) => {
    if (!token) return;
    try {
      await automatchDecline(token, inviteId);
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const renderInvite = (row) => {
    const title = row.title || row.category || 'Invitacion';
    const kindLabel = row.kind === 'offer' ? 'Oferta' : 'Solicitud';
    const status = row.status || 'pending';
    const group = status === 'accepted' ? 'Aceptada' : (status === 'pending' ? 'Pendiente' : 'Archivada');
    return (
      <View key={row.id} style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>{title}</Text>
        <Text style={styles.inviteMeta}>{kindLabel} · {group}</Text>
        {status === 'pending' ? (
          <View style={styles.inviteActions}>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => onAccept(row.id)}>
              <Text style={styles.btnPrimaryText}>Aceptar</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onDecline(row.id)}>
              <Text style={styles.btnGhostText}>Rechazar</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const summaryActive = enabled || seekerEnabled;
  const summaryRadius = mode === 'simple' ? simpleRadius : radiusKm;
  const summaryCats = mode === 'simple'
    ? (summaryActive ? AM_CATS.length : 0)
    : (categories.length + seekerCategories.length);
  const summaryInvites = mode === 'simple' ? 20 : maxInvites;

  const stats = React.useMemo(() => {
    const out = {
      pending: 0,
      accepted: 0,
      archived: 0,
      all: invites.length,
      request: 0,
      offer: 0,
    };
    invites.forEach((row) => {
      const status = row && row.status;
      const kind = row && row.kind === 'offer' ? 'offer' : 'request';
      const bucket = status === 'pending' ? 'pending' : (status === 'accepted' ? 'accepted' : 'archived');
      out[bucket] += 1;
      out[kind] += 1;
    });
    return out;
  }, [invites]);

  const filteredInvites = React.useMemo(() => {
    return invites.filter((row) => {
      if (!row) return false;
      const status = row.status || 'pending';
      const bucket = status === 'pending' ? 'pending' : (status === 'accepted' ? 'accepted' : 'archived');
      const kind = row.kind === 'offer' ? 'offer' : 'request';
      if (statusFilter !== 'all' && bucket !== statusFilter) return false;
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      return true;
    });
  }, [invites, statusFilter, kindFilter]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>AutoMatch</Text>
        {loading && !booted ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.brand} />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {error ? (
              <View style={styles.errorBanner}>
                <Text style={styles.err}>{error.message || 'Error'}</Text>
                <Pressable onPress={load} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable>
              </View>
            ) : null}

            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>{summaryActive ? 'AutoMatch activo' : 'AutoMatch inactivo'}</Text>
              <Text style={styles.statusSub}>Radio {summaryRadius} km · Categorias {summaryCats} · Invitaciones/dia {summaryInvites}</Text>
            </View>

            <View style={styles.modeWrap}>
              <Pressable style={[styles.modeBtn, mode === 'simple' && styles.modeBtnActive]} onPress={() => setMode('simple')}>
                <Text style={[styles.modeText, mode === 'simple' && styles.modeTextActive]}>Modo simple</Text>
              </Pressable>
              <Pressable style={[styles.modeBtn, mode === 'advanced' && styles.modeBtnActive]} onPress={() => setMode('advanced')}>
                <Text style={[styles.modeText, mode === 'advanced' && styles.modeTextActive]}>Modo avanzado</Text>
              </Pressable>
            </View>

            {mode === 'simple' ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Que quieres hacer?</Text>
                <View style={styles.rowGap}>
                  <Pressable style={[styles.choice, enabled && styles.choiceActive]} onPress={() => setEnabled(v => !v)}>
                    <Text style={styles.choiceTitle}>Ofrecer ayuda</Text>
                    <Text style={styles.choiceSub}>Te llegan solicitudes compatibles.</Text>
                  </Pressable>
                  <Pressable style={[styles.choice, seekerEnabled && styles.choiceActive]} onPress={() => setSeekerEnabled(v => !v)}>
                    <Text style={styles.choiceTitle}>Recibir ayuda</Text>
                    <Text style={styles.choiceSub}>Te llegan ofertas automaticas.</Text>
                  </Pressable>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Distancia</Text>
                <View style={styles.pills}>
                  {SIMPLE_RADIUS.map(r => (
                    <Pressable key={r} style={[styles.pill, simpleRadius === r && styles.pillActive]} onPress={() => {
                      setSimpleRadius(r);
                      setRadiusKm(r);
                    }}>
                      <Text style={[styles.pillText, simpleRadius === r && styles.pillTextActive]}>{r} km</Text>
                    </Pressable>
                  ))}
                </View>

                <Pressable style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]} onPress={saveSimple} disabled={saving}>
                  <Text style={styles.btnPrimaryText}>{saving ? 'Guardando...' : 'Activar AutoMatch'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Roles</Text>
                <View style={styles.rowGap}>
                  <Pressable style={[styles.choice, enabled && styles.choiceActive]} onPress={() => setEnabled(v => !v)}>
                    <Text style={styles.choiceTitle}>Ofrecer ayuda</Text>
                    <Text style={styles.choiceSub}>Solicitudes que encajan con tus ofertas.</Text>
                  </Pressable>
                  <Pressable style={[styles.choice, seekerEnabled && styles.choiceActive]} onPress={() => setSeekerEnabled(v => !v)}>
                    <Text style={styles.choiceTitle}>Recibir ayuda</Text>
                    <Text style={styles.choiceSub}>Ofertas compatibles contigo.</Text>
                  </Pressable>
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Categorias para ofrecer</Text>
                <View style={styles.chips}>
                  {AM_CATS.map(c => (
                    <Pressable key={c.id} style={[styles.chip, categories.includes(c.id) && styles.chipActive]} onPress={() => toggleCat(c.id, false)}>
                      <Text style={[styles.chipText, categories.includes(c.id) && styles.chipTextActive]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Categorias para recibir</Text>
                <View style={styles.chips}>
                  {AM_CATS.map(c => (
                    <Pressable key={c.id} style={[styles.chip, seekerCategories.includes(c.id) && styles.chipActive]} onPress={() => toggleCat(c.id, true)}>
                      <Text style={[styles.chipText, seekerCategories.includes(c.id) && styles.chipTextActive]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Radio (km)</Text>
                  <TextInput
                    style={styles.input}
                    value={String(radiusKm)}
                    onChangeText={setRadiusKm}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>Invitaciones al dia</Text>
                  <TextInput
                    style={styles.input}
                    value={String(maxInvites)}
                    onChangeText={setMaxInvites}
                    keyboardType="numeric"
                  />
                </View>

                <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Horarios</Text>
                <View style={styles.timeRow}>
                  <Text style={styles.fieldLabel}>Laborables</Text>
                  <TextInput style={styles.input} value={weekdayStart} onChangeText={setWeekdayStart} placeholder="17:00" />
                  <Text style={styles.timeSep}>—</Text>
                  <TextInput style={styles.input} value={weekdayEnd} onChangeText={setWeekdayEnd} placeholder="21:00" />
                </View>
                <View style={styles.timeRow}>
                  <Text style={styles.fieldLabel}>Fines de semana</Text>
                  <TextInput style={styles.input} value={weekendStart} onChangeText={setWeekendStart} placeholder="00:00" />
                  <Text style={styles.timeSep}>—</Text>
                  <TextInput style={styles.input} value={weekendEnd} onChangeText={setWeekendEnd} placeholder="23:59" />
                </View>

                <Pressable style={[styles.btn, styles.btnPrimary, { marginTop: 12 }]} onPress={saveAdvanced} disabled={saving}>
                  <Text style={styles.btnPrimaryText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Invitaciones</Text>
              <View style={styles.filterRow}>
                <Pressable style={[styles.filterChip, statusFilter === 'pending' && styles.filterChipActive]} onPress={() => setStatusFilter('pending')}>
                  <Text style={[styles.filterText, statusFilter === 'pending' && styles.filterTextActive]}>Pendientes {stats.pending}</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, statusFilter === 'accepted' && styles.filterChipActive]} onPress={() => setStatusFilter('accepted')}>
                  <Text style={[styles.filterText, statusFilter === 'accepted' && styles.filterTextActive]}>Aceptadas {stats.accepted}</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, statusFilter === 'archived' && styles.filterChipActive]} onPress={() => setStatusFilter('archived')}>
                  <Text style={[styles.filterText, statusFilter === 'archived' && styles.filterTextActive]}>Archivadas {stats.archived}</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]} onPress={() => setStatusFilter('all')}>
                  <Text style={[styles.filterText, statusFilter === 'all' && styles.filterTextActive]}>Todas {stats.all}</Text>
                </Pressable>
              </View>

              <View style={styles.filterRow}>
                <Pressable style={[styles.filterChip, kindFilter === 'all' && styles.filterChipActive]} onPress={() => setKindFilter('all')}>
                  <Text style={[styles.filterText, kindFilter === 'all' && styles.filterTextActive]}>Todas</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, kindFilter === 'request' && styles.filterChipActive]} onPress={() => setKindFilter('request')}>
                  <Text style={[styles.filterText, kindFilter === 'request' && styles.filterTextActive]}>Solicitudes {stats.request}</Text>
                </Pressable>
                <Pressable style={[styles.filterChip, kindFilter === 'offer' && styles.filterChipActive]} onPress={() => setKindFilter('offer')}>
                  <Text style={[styles.filterText, kindFilter === 'offer' && styles.filterTextActive]}>Ofertas {stats.offer}</Text>
                </Pressable>
                <Pressable style={styles.refreshBtn} onPress={load}>
                  <Text style={styles.refreshText}>Actualizar</Text>
                </Pressable>
              </View>

              {!filteredInvites.length ? (
                <Text style={styles.muted}>No hay invitaciones por ahora.</Text>
              ) : (
                filteredInvites.map(renderInvite)
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: 26, fontWeight: '800', marginBottom: 12 },
  center: { paddingVertical: 30, alignItems: 'center', gap: 12 },
  err: { color: theme.colors.danger, textAlign: 'center' },
  retry: { borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, paddingHorizontal: 14, borderRadius: theme.radius.md },
  retryText: { color: theme.colors.text },
  errorBanner: { gap: 8 },
  statusCard: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  statusTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  statusSub: { color: theme.colors.muted, marginTop: 6 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  modeWrap: { flexDirection: 'row', gap: 8 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, borderRadius: theme.radius.md },
  modeBtnActive: { backgroundColor: 'rgba(42, 212, 165, 0.15)', borderColor: theme.colors.brand },
  modeText: { textAlign: 'center', color: theme.colors.muted, fontWeight: '700' },
  modeTextActive: { color: theme.colors.text },
  sectionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  rowGap: { gap: 10 },
  choice: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12 },
  choiceActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.1)' },
  choiceTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 15 },
  choiceSub: { color: theme.colors.muted, marginTop: 4 },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  pillActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  pillText: { color: theme.colors.muted, fontWeight: '700' },
  pillTextActive: { color: theme.colors.text },
  btn: { borderRadius: theme.radius.md, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  chipText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: theme.colors.text },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  fieldLabel: { color: theme.colors.muted, width: 120 },
  input: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 10, color: theme.colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  timeSep: { color: theme.colors.muted },
  inviteCard: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, marginTop: 8 },
  inviteTitle: { color: theme.colors.text, fontWeight: '800' },
  inviteMeta: { color: theme.colors.muted, marginTop: 4 },
  inviteActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  muted: { color: theme.colors.muted },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filterChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  filterChipActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  filterText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: theme.colors.text },
  refreshBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  refreshText: { color: theme.colors.text, fontWeight: '700', fontSize: 12 },
});
