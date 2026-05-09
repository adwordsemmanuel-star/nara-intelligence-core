require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const csv = require('csv-parser');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CSV_FILE_PATH = '/Users/diego/Downloads/Base clientes - General.csv';

async function importData() {
    console.log('iniciando importación...');

    // 1. Obtener psicólogos de la base de datos
    const { data: psicologos, error: psiError } = await supabase.from('psicologos').select('*');
    if (psiError) {
        console.error('Error al obtener psicólogos:', psiError);
        return;
    }

    // Crear un mapa para buscar fácilmente por nombre
    // Ejemplo: { 'angelica': 'uuid-1234', 'aracelly': 'uuid-5678' }
    const psiMap = {};
    psicologos.forEach(p => {
        psiMap[p.nombre.toLowerCase()] = p.id;
    });

    const pacientesAInsertar = [];
    let rowIndex = 0;

    // 2. Leer y parsear el CSV
    fs.createReadStream(CSV_FILE_PATH)
        .pipe(csv())
        .on('data', (row) => {
            rowIndex++;
            
            // Limpiar teléfono (solo números)
            let telefono = row['Teléfono'] ? row['Teléfono'].replace(/\D/g, '') : '';
            
            // Si no hay teléfono, inventamos uno para que la BD no marque error (UNIQUE NOT NULL)
            if (!telefono || telefono.trim() === '') {
                telefono = `SIN_TEL_${rowIndex}`;
            }

            // Buscar el ID de la psicóloga (si hay una asignada en el Excel)
            let psicologoId = null;
            const psicologaAsignada = row['Psicóloga asignada'] ? row['Psicóloga asignada'].trim().toLowerCase() : '';
            if (psicologaAsignada && psiMap[psicologaAsignada]) {
                psicologoId = psiMap[psicologaAsignada];
            } else if (psicologaAsignada && psicologaAsignada === 'ara') {
                psicologoId = psiMap['aracelly']; // Manejar posibles apodos
            }

            // Construir el objeto para la base de datos
            pacientesAInsertar.push({
                nombre: row['Nombre'] ? row['Nombre'].trim() : 'Sin Nombre',
                telefono: telefono,
                estatus: row['Estatus'] ? row['Estatus'].trim() : null,
                servicio: row['Servicio'] ? row['Servicio'].trim() : null,
                psicologo_asignado_id: psicologoId,
                fecha_ultimo_contacto: row['Último contacto'] ? row['Último contacto'].trim() : (row['Fecha contacto'] ? row['Fecha contacto'].trim() : null),
                notas: row['Relative'] ? `Nota: ${row['Relative']}` : null
            });
        })
        .on('end', async () => {
            console.log(`CSV leído. Procesando ${pacientesAInsertar.length} pacientes...`);
            
            // Eliminar duplicados en el array antes de hacer upsert
            const uniquePacientes = [];
            const phoneSet = new Set();
            for (const p of pacientesAInsertar) {
                if (!phoneSet.has(p.telefono)) {
                    phoneSet.add(p.telefono);
                    uniquePacientes.push(p);
                } else {
                    console.log(`Se omitió el registro duplicado por teléfono: ${p.nombre} (${p.telefono})`);
                }
            }

            console.log(`Borrando duplicados... Total a insertar: ${uniquePacientes.length}`);

            // 3. Insertar en Supabase
            // Usamos upsert por si ejecutamos el script dos veces, que no haya error de teléfono duplicado
            const { data, error } = await supabase
                .from('pacientes')
                .upsert(uniquePacientes, { onConflict: 'telefono' })
                .select();

            if (error) {
                console.error('❌ Error insertando pacientes:', error);
            } else {
                console.log(`✅ ¡Éxito! Se importaron/actualizaron ${data.length} pacientes en la base de datos.`);
            }
        });
}

importData();
