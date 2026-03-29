import React from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { addFavorite, createMatchFromOffer, createMatchFromRequest, feed, listFavorites, removeFavorite } from '../api/khApi';
import { CATEGORIES, categoryLabel } from '../constants';

function FeedCard({ item, isFav, onFav, onDetail, onMatch }) {
  const kindLabel = item.kind === 'offer' ? 'Oferta' : 'Solicitud';
  const comp = item.compensation_type || 'cash';
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardKind}>{kindLabel}</Text>
        <Pressable onPress={onFav} style={[styles.favBtn, isFav && styles.favBtnActive]}>
          <Text style={[styles.favText, isFav && styles.favTextActive]}>{isFav ? 'Favorito' : 'Guardar'}</Text>
        </Pressable>
      </View>
      <Text style={styles.cardTitle}>{item.title || 'Sin titulo'}</Text>
      <Text style={styles.cardMeta}>{categoryLabel(item.category)} · {item.location_text || 'Zona'} · {comp}</Text>
      <Text style={styles.cardUser}>{item.user_name || 'Vecino'} · {Number(item.user_rating || 0).toFixed(1)}★</Text>
      <View style={styles.cardActions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onDetail}>
          <Text style={styles.btnGhostText}>Ver</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onMatch}>
          <Text style={styles.btnPrimaryText}>Crear match</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ExploreScreen({ navigation }) {
  const { token } = useAuth();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [kind, setKind] = React.useState('all');
  const [favorites, setFavorites] = React.useState(new Set());

  const load = React.useCallback(async (isRefresh) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await feed(token, { limit: 60, offset: 0 });
      setItems((out && out.data) || []);
      const fav = await listFavorites(token, { limit: 200, offset: 0 });
      const set = new Set(((fav && fav.data) || []).map(r => `${r.kind}:${r.id}`));
      setFavorites(set);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  React.useEffect(() => {
    load(false);
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((row) => {
      if (!row) return false;
      if (cat !== 'all' && row.category !== cat) return false;
      if (kind !== 'all' && row.kind !== kind) return false;
      if (!q) return true;
      const hay = `${row.title || ''} ${row.location_text || ''} ${row.user_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query, cat, kind]);

  const toggleFavorite = async (row) => {
    const key = `${row.kind}:${row.id}`;
    const next = new Set(favorites);
    if (next.has(key)) {
      await removeFavorite(token, row.kind, row.id);
      next.delete(key);
    } else {
      await addFavorite(token, row.kind, row.id);
      next.add(key);
    }
    setFavorites(next);
  };

  const createMatch = async (row) => {
    try {
      const out = row.kind === 'offer'
        ? await createMatchFromOffer(token, row.id)
        : await createMatchFromRequest(token, row.id);
      if (out && out.id) navigation.navigate('Match', { matchId: out.id, title: row.title || 'Match' });
    } catch (e) {
      Alert.alert('Match', e.message || 'No se pudo crear.');
    }
  };

  const renderItem = ({ item }) => (
    <FeedCard
      item={item}
      isFav={favorites.has(`${item.kind}:${item.id}`)}
      onFav={() => toggleFavorite(item)}
      onDetail={() => navigation.navigate('FeedDetail', { kind: item.kind, id: item.id })}
      onMatch={() => createMatch(item)}
    />
  );

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Explorar</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar"
        placeholderTextColor={theme.colors.muted}
        style={styles.search}
      />
      <View style={styles.filterRow}>
        <Pressable style={[styles.filterChip, kind === 'all' && styles.filterChipActive]} onPress={() => setKind('all')}>
          <Text style={[styles.filterText, kind === 'all' && styles.filterTextActive]}>Todo</Text>
        </Pressable>
        <Pressable style={[styles.filterChip, kind === 'request' && styles.filterChipActive]} onPress={() => setKind('request')}>
          <Text style={[styles.filterText, kind === 'request' && styles.filterTextActive]}>Solicitudes</Text>
        </Pressable>
        <Pressable style={[styles.filterChip, kind === 'offer' && styles.filterChipActive]} onPress={() => setKind('offer')}>
          <Text style={[styles.filterText, kind === 'offer' && styles.filterTextActive]}>Ofertas</Text>
        </Pressable>
      </View>
      <View style={styles.filterRow}>
        <Pressable style={[styles.filterChip, cat === 'all' && styles.filterChipActive]} onPress={() => setCat('all')}>
          <Text style={[styles.filterText, cat === 'all' && styles.filterTextActive]}>Categorias</Text>
        </Pressable>
        {CATEGORIES.map(c => (
          <Pressable key={c.id} style={[styles.filterChip, cat === c.id && styles.filterChipActive]} onPress={() => setCat(c.id)}>
            <Text style={[styles.filterText, cat === c.id && styles.filterTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <Screen style={{ padding: 0 }}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => `${it.kind}:${it.id}`}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
          ListEmptyComponent={<Text style={styles.empty}>Sin resultados.</Text>}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  header: { marginBottom: 12 },
  search: {
    color: theme.colors.text,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: theme.colors.card,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  filterChip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  filterChipActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.15)' },
  filterText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: theme.colors.text },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 14, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardKind: { color: theme.colors.brand, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800', marginTop: 6 },
  cardMeta: { color: theme.colors.muted, marginTop: 6 },
  cardUser: { color: theme.colors.muted, marginTop: 6 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: theme.colors.brand },
  btnPrimaryText: { color: '#0B1220', fontWeight: '800' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  favBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  favBtnActive: { borderColor: theme.colors.brand, backgroundColor: 'rgba(42, 212, 165, 0.12)' },
  favText: { color: theme.colors.muted, fontSize: 12, fontWeight: '700' },
  favTextActive: { color: theme.colors.text },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
});
