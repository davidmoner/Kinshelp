import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { listMatches } from '../api/khApi';
import { useAuth } from '../state/auth';

function MatchRow({ item, onPress }) {
  const other = item.provider_name || item.seeker_name;
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{other || 'Match'}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.status} · {item.request_title || item.offer_title || 'Sin titulo'}
        </Text>
      </View>
      <Text style={styles.chev}>›</Text>
    </Pressable>
  );
}

export default function MatchesScreen({ navigation }) {
  const { token, signOut } = useAuth();
  const [data, setData] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [err, setErr] = React.useState(null);

  async function load(isRefresh) {
    if (!token) return;
    setErr(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await listMatches(token, { limit: 30, offset: 0 });
      // API returns { data: [...] }
      setData((out && out.data) || []);
    } catch (e) {
      setErr(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  React.useEffect(() => {
    load(false);
  }, [token]);

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={styles.title}>Matches</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.link}>Salir</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable style={styles.tab} onPress={() => navigation.navigate('Notifications')}>
          <Text style={styles.tabText}>Notificaciones</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.brand} />
        </View>
      ) : err ? (
        <View style={styles.center}>
          <Text style={styles.err}>{err.message}</Text>
          <Pressable onPress={() => load(false)} style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => String(it.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
          renderItem={({ item }) => (
            <MatchRow
              item={item}
              onPress={() => navigation.navigate('Chat', { matchId: item.id, title: item.request_title || item.offer_title || 'Chat' })}
            />
          )}
          ListEmptyComponent={<Text style={styles.empty}>No hay matches aun.</Text>}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  link: { color: theme.colors.brand, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tab: { borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radius.md },
  tabText: { color: theme.colors.muted },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  err: { color: theme.colors.danger, marginBottom: 12 },
  retry: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: theme.radius.md },
  retryText: { color: theme.colors.text },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 14, marginBottom: 10 },
  rowTitle: { color: theme.colors.text, fontWeight: '800' },
  rowSub: { color: theme.colors.muted, marginTop: 4 },
  chev: { color: theme.colors.muted, fontSize: 28, marginLeft: 8 },
});
