import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { changeMatchStatus, getMatch, me, setMatchAgreement, submitMatchRating } from '../api/khApi';
import { COMPENSATION_OPTIONS } from '../constants';

export default function MatchDetailScreen({ route, navigation }) {
  const { token } = useAuth();
  const matchId = route.params?.matchId;
  const title = route.params?.title || 'Match';
  const [loading, setLoading] = React.useState(true);
  const [match, setMatch] = React.useState(null);
  const [meUser, setMeUser] = React.useState(null);
  const [comp, setComp] = React.useState('cash');
  const [points, setPoints] = React.useState('');
  const [barter, setBarter] = React.useState('');
  const [rating, setRating] = React.useState('');
  const [review, setReview] = React.useState('');

  React.useEffect(() => {
    navigation.setOptions({ title });
  }, [title, navigation]);

  const load = React.useCallback(async () => {
    if (!token || !matchId) return;
    setLoading(true);
    try {
      const u = await me(token);
      const m = await getMatch(token, matchId);
      setMeUser(u);
      setMatch(m);
      if (m && m.compensation_type) setComp(m.compensation_type);
      if (m && m.points_agreed != null) setPoints(String(m.points_agreed));
      if (m && m.barter_terms) setBarter(String(m.barter_terms));
    } finally {
      setLoading(false);
    }
  }, [token, matchId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const role = React.useMemo(() => {
    if (!match || !meUser) return null;
    if (match.provider_id === meUser.id) return 'provider';
    if (match.seeker_id === meUser.id) return 'seeker';
    return null;
  }, [match, meUser]);

  const initiator = match && match.initiated_by ? match.initiated_by : null;
  const receiver = initiator === 'provider' ? 'seeker' : (initiator === 'seeker' ? 'provider' : null);

  const doAction = async (action) => {
    if (!token || !matchId) return;
    await changeMatchStatus(token, matchId, action);
    load();
  };

  const saveAgreement = async () => {
    if (comp === 'cash' && !points) return;
    if (comp === 'barter' && !barter.trim()) return;
    const body = { compensation_type: comp };
    if (comp === 'cash') body.points_agreed = Number(points || 0);
    if (comp === 'barter') body.barter_terms = barter;
    await setMatchAgreement(token, matchId, body);
    load();
  };

  const sendRating = async () => {
    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) return;
    await submitMatchRating(token, matchId, { rating: r, review: review || null });
    setRating('');
    setReview('');
    load();
  };

  const canRate = React.useMemo(() => {
    if (!match || !role) return false;
    if (match.status !== 'done') return false;
    if (role === 'provider') return match.provider_rating == null;
    return match.seeker_rating == null;
  }, [match, role]);

  return (
    <Screen>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : !match ? (
        <Text style={styles.empty}>Match no encontrado.</Text>
      ) : (
        <View>
          <View style={styles.card}>
            <Text style={styles.h}>Estado</Text>
            <Text style={styles.meta}>Status: {match.status}</Text>
            <Text style={styles.meta}>Compensacion: {match.compensation_type || 'cash'}</Text>
            <Text style={styles.meta}>Puntos: {match.points_agreed || 0}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.h}>Acciones</Text>
            <View style={styles.actionsRow}>
              {match.status === 'pending' && role === receiver ? (
                <>
                  <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => doAction('accept')}>
                    <Text style={styles.btnPrimaryText}>Aceptar</Text>
                  </Pressable>
                  <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => doAction('reject')}>
                    <Text style={styles.btnGhostText}>Rechazar</Text>
                  </Pressable>
                </>
              ) : null}
              {match.status === 'pending' && role === initiator ? (
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => doAction('cancel')}>
                  <Text style={styles.btnGhostText}>Cancelar</Text>
                </Pressable>
              ) : null}
              {match.status === 'accepted' && role === 'provider' ? (
                <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => doAction('done')}>
                  <Text style={styles.btnPrimaryText}>Marcar como hecho</Text>
                </Pressable>
              ) : null}
              {match.status === 'accepted' && role === 'seeker' ? (
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => doAction('cancel')}>
                  <Text style={styles.btnGhostText}>Cancelar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.h}>Acuerdo</Text>
            <View style={styles.chips}>
              {COMPENSATION_OPTIONS.map(opt => (
                <Pressable key={opt.id} style={[styles.chip, comp === opt.id && styles.chipActive]} onPress={() => setComp(opt.id)}>
                  <Text style={[styles.chipText, comp === opt.id && styles.chipTextActive]}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            {comp === 'cash' ? (
              <TextInput
                value={points}
                onChangeText={setPoints}
                placeholder="EUR"
                placeholderTextColor={theme.colors.muted}
                keyboardType="numeric"
                style={styles.input}
              />
            ) : null}
            {comp === 'barter' ? (
              <TextInput
                value={barter}
                onChangeText={setBarter}
                placeholder="Terminos"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { height: 90 }]}
                multiline
              />
            ) : null}
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={saveAgreement}>
              <Text style={styles.btnPrimaryText}>Guardar acuerdo</Text>
            </Pressable>
          </View>

          {canRate ? (
            <View style={styles.card}>
              <Text style={styles.h}>Valoracion</Text>
              <TextInput
                value={rating}
                onChangeText={setRating}
                placeholder="1-5"
                placeholderTextColor={theme.colors.muted}
                keyboardType="numeric"
                style={styles.input}
              />
              <TextInput
                value={review}
                onChangeText={setReview}
                placeholder="Comentario"
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, { height: 90 }]}
                multiline
              />
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={sendRating}>
                <Text style={styles.btnPrimaryText}>Enviar</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('Chat', { matchId, title: 'Chat' })}>
            <Text style={styles.btnGhostText}>Ir al chat</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 16, marginBottom: 12 },
  h: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: theme.colors.muted, marginTop: 6 },
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 },
  btn: { borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', marginTop: 10 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  input: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10, backgroundColor: theme.colors.card },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  chipText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: theme.colors.text },
});
