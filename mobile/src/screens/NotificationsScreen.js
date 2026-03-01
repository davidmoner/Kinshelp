import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { listNotifications, markNotificationRead } from '../api/khApi';
import { useAuth } from '../state/auth';

function Row({ item, onRead }) {
  const unread = !item.read_at;
  return (
    <Pressable onPress={onRead} style={[styles.row, unread && styles.unread]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.kind}>{item.kind}</Text>
        {!!item.title && <Text style={styles.title}>{item.title}</Text>}
        {!!item.body && <Text style={styles.body} numberOfLines={2}>{item.body}</Text>}
      </View>
      {unread ? <Text style={styles.dot}>●</Text> : null}
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { token } = useAuth();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  async function load(isRefresh) {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await listNotifications(token, { limit: 60, offset: 0 });
      setItems((out && out.data) || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  React.useEffect(() => {
    load(false);
  }, [token]);

  async function onRead(item) {
    if (!item || !item.id) return;
    if (!item.read_at) {
      try {
        await markNotificationRead(token, item.id);
      } catch {
        // ignore
      }
    }
    await load(true);
  }

  return (
    <Screen>
      <Text style={styles.h1}>Notificaciones</Text>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
          renderItem={({ item }) => <Row item={item} onRead={() => onRead(item)} />}
          ListEmptyComponent={<Text style={styles.empty}>Sin notificaciones.</Text>}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', gap: 10, backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 14, marginBottom: 10 },
  unread: { borderColor: 'rgba(42,212,165,0.45)' },
  kind: { color: theme.colors.brand, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: theme.colors.text, fontWeight: '800', marginTop: 4 },
  body: { color: theme.colors.muted, marginTop: 6 },
  dot: { color: theme.colors.brand, fontSize: 14 },
});
