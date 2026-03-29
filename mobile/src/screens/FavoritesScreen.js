import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../ui/Screen';
import { theme } from '../ui/theme';
import { useAuth } from '../state/auth';
import { listFavorites, removeFavorite } from '../api/khApi';
import { categoryLabel } from '../constants';

function Row({ item, onOpen, onRemove }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{item.title || 'Sin titulo'}</Text>
      <Text style={styles.rowMeta}>{categoryLabel(item.category)} · {item.location_text || 'Zona'} · {item.kind}</Text>
      <View style={styles.rowActions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={onOpen}>
          <Text style={styles.btnGhostText}>Ver</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnDanger]} onPress={onRemove}>
          <Text style={styles.btnDangerText}>Quitar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function FavoritesScreen({ navigation }) {
  const { token } = useAuth();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (isRefresh) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const out = await listFavorites(token, { limit: 100, offset: 0 });
      setItems((out && out.data) || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  React.useEffect(() => {
    load(false);
  }, [load]);

  const onRemove = async (item) => {
    await removeFavorite(token, item.kind, item.id);
    load(true);
  };

  return (
    <Screen style={{ padding: 0 }}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.favorite_id || it.id)}
          renderItem={({ item }) => (
            <Row
              item={item}
              onOpen={() => navigation.navigate('FeedDetail', { kind: item.kind, id: item.id })}
              onRemove={() => onRemove(item)}
            />
          )}
          ListHeaderComponent={<Text style={styles.title}>Favoritos</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.brand} />}
          ListEmptyComponent={<Text style={styles.empty}>Aun no guardaste favoritos.</Text>}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginBottom: 12 },
  empty: { color: theme.colors.muted, textAlign: 'center', marginTop: 20 },
  row: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.lg, padding: 14, marginBottom: 12 },
  rowTitle: { color: theme.colors.text, fontWeight: '800', fontSize: 16 },
  rowMeta: { color: theme.colors.muted, marginTop: 6 },
  rowActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  btn: { borderRadius: theme.radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '700' },
  btnDanger: { borderWidth: 1, borderColor: 'rgba(255,90,122,0.5)', backgroundColor: 'rgba(255,90,122,0.12)' },
  btnDangerText: { color: theme.colors.danger, fontWeight: '700' },
});
