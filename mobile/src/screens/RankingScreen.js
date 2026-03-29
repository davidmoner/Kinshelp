import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { leaderboard, leaderboardMe } from '../api/khApi';

function Row({ item, idx }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rank}>#{idx + 1}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.display_name || 'Vecino'}</Text>
        <Text style={styles.meta}>{item.location_text || 'Zona'} · {Number(item.points_balance || 0)} rep</Text>
      </View>
    </View>
  );
}

export default function RankingScreen() {
  const { token } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [meRow, setMeRow] = React.useState(null);
  const [query, setQuery] = React.useState('');

  const load = React.useCallback(async (isRefresh) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await leaderboard(token, { limit: 30, offset: 0, q: query.trim() || undefined });
      setItems((out && out.data) || []);
      const mine = await leaderboardMe(token, {});
      setMeRow(mine && mine.me ? { ...mine.me, rank: mine.rank } : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, query]);

  React.useEffect(() => {
    load(false);
  }, [load]);

  return (
    <Screen style={{ padding: 0 }}>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.id)}
        renderItem={({ item, index }) => <Row item={item} idx={index} />}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.title}>Ranking</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar vecino"
              placeholderTextColor={theme.colors.muted}
              style={styles.search}
            />
            <Pressable style={styles.refreshBtn} onPress={() => load(true)}>
              <Text style={styles.refreshText}>Actualizar</Text>
            </Pressable>
            {meRow ? (
              <View style={styles.meBox}>
                <Text style={styles.meTitle}>Tu posicion</Text>
                <Text style={styles.meText}>#{meRow.rank} · {meRow.display_name} · {meRow.points_balance} rep</Text>
              </View>
            ) : null}
          </View>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
        ListEmptyComponent={loading ? <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View> : <Text style={styles.empty}>Sin resultados.</Text>}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: 12 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 10 },
  search: { color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.colors.card },
  refreshBtn: { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingVertical: 6, paddingHorizontal: 12 },
  refreshText: { color: theme.colors.text, fontWeight: '700' },
  meBox: { marginTop: 12, backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 10 },
  meTitle: { color: theme.colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  meText: { color: theme.colors.text, marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 12, marginBottom: 10 },
  rank: { color: theme.colors.brand, fontWeight: '800', width: 40 },
  name: { color: theme.colors.text, fontWeight: '800' },
  meta: { color: theme.colors.muted, marginTop: 4 },
  center: { paddingVertical: 30, alignItems: 'center' },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
});
