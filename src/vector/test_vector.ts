import 'dotenv/config';
import { embedText, queryByText, upsertEmbedding } from '../vector';

async function main() {
  const id = 'demo_neck_massager';
  const doc = 'Ergonomic neck massager with heat therapy for neck and shoulder pain relief.';
  const query = 'I need something to relieve neck and shoulder tension';

  const vec = await embedText(doc);
  await upsertEmbedding(id, vec, { category: 'Healthtech and Wellness', brand: 'demo' });

  const res = await queryByText(query, 3);
  console.log('Top matches:', res.matches);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
