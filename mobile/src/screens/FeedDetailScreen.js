import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { addFavorite, createMatchFromOffer, createMatchFromRequest, createReport, getOffer, getRequest, listFavorites, removeFavorite } from '../api/khApi';
import { categoryLabel } from '../constants';

export default function FeedDetailScreen({ route, navigation }) {
  const { token } = useAuth();
  const kind = route.params?.kind || 'request';
  const id = route.params?.id;
  const [loading, setLoading] = React.useState(true);
  const [item, setItem] = React.useState(null);
  const [isFav, setIsFav] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    try {
      const row = kind === 'offer' ? await getOffer(token, id) : await getRequest(token, id);
      setItem(row);
      const fav = await listFavorites(token, { limit: 200, offset: 0 });
      const set = new Set(((fav && fav.data) || []).map(r => `${r.kind}:${r.id}`));
      setIsFav(set.has(`${kind}:${id}`));
    } finally {
      setLoading(false);
    }
  }, [token, kind, id]);

  React.useEffect(() => {
    load();
  }, [load]);

  const toggleFav = async () => {
    if (!item) return;
    if (isFav) await removeFavorite(token, kind, id);
    else await addFavorite(token, kind, id);
    setIsFav(!isFav);
  };

  const createMatch = async () => {
    if (!item) return;
    const out = kind === 'offer'
      ? await createMatchFromOffer(token, id)
      : await createMatchFromRequest(token, id);
    if (out && out.id) navigation.navigate('Match', { matchId: out.id, title: item.title || 'Match' });
  };

  const report = async (reason) => {
    await createReport(token, { target_type: kind, target_id: id, reason });
  };

  const userName = kind === 'offer' ? item?.provider_name : item?.seeker_name;
  const rating = kind === 'offer' ? item?.provider_rating : item?.seeker_rating;

  return (
    <Screen>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : !item ? (
        <Text style={styles.empty}>No encontrado.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.title}>{item.title || 'Detalle'}</Text>
          <Text style={styles.meta}>{categoryLabel(item.category)} · {item.location_text || 'Zona'}</Text>
          <Text style={styles.meta}>Compensacion: {item.compensation_type || 'cash'}</Text>
          {item.when_text ? <Text style={styles.meta}>Cuando: {item.when_text}</Text> : null}
          <Text style={styles.desc}>{item.description || 'Sin descripcion.'}</Text>

          <View style={styles.userBox}>
            <Text style={styles.userTitle}>Vecino</Text>
            <Text style={styles.userName}>{userName || 'Vecino'}</Text>
            <Text style={styles.userMeta}>Rating {Number(rating || 0).toFixed(1)}★</Text>
          </View>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={createMatch}>
              <Text style={styles.btnPrimaryText}>Crear match</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={toggleFav}>
              <Text style={styles.btnGhostText}>{isFav ? 'Quitar favorito' : 'Guardar favorito'}</Text>
            </Pressable>
          </View>

          <View style={styles.reportBox}>
            <Text style={styles.reportTitle}>Reportar</Text>
            <View style={styles.reportActions}>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => report('spam')}>
                <Text style={styles.btnGhostText}>Spam</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => report('abuse')}>
                <Text style={styles.btnGhostText}>Abuso</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => report('other')}>
                <Text style={styles.btnGhostText}>Otro</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  meta: { color: theme.colors.muted, marginTop: 6 },
  desc: { color: theme.colors.text, marginTop: 12, lineHeight: 20 },
  userBox: { marginTop: 16, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, backgroundColor: theme.colors.card },
  userTitle: { color: theme.colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  userName: { color: theme.colors.text, fontWeight: '800', marginTop: 6 },
  userMeta: { color: theme.colors.muted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  reportBox: { marginTop: 16 },
  reportTitle: { color: theme.colors.muted, marginBottom: 8 },
  reportActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
