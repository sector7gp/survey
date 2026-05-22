const PDFDocument = require('pdfkit');

/**
 * Generates a styled PDF report for a lead's digital maturity results.
 * Returns a Promise that resolves to a Buffer containing the PDF.
 * 
 * @param {Object} leadData - Contains nombre, email, empresa, tamano_empresa, cargo, provincia, ciudad, whatsapp, rubro
 * @param {Object} scoreData - Contains score, profile, detailedAnswers (array of { question, answer, points })
 * @param {Object} profileConfig - The configuration object for this profile from preguntas.json
 */
function generatePDF(leadData, scoreData, profileConfig) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, bufferPages: true });
      const buffers = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      // Colores de Perfil
      const colors = {
        green: { primary: '#16a34a', bg: '#f0fdf4', text: '#15803d' },
        yellow: { primary: '#ca8a04', bg: '#fef9c3', text: '#a16207' },
        red: { primary: '#dc2626', bg: '#fef2f2', text: '#b91c1c' },
        neutralDark: '#1e293b',
        neutralLight: '#64748b',
        border: '#e2e8f0'
      };

      const profileColor = colors[scoreData.profile] || colors.red;

      // --- ENCABEZADO ---
      doc.rect(0, 0, 612, 120).fill(profileColor.primary);
      
      doc.fillColor('#ffffff')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('Diagnóstico del Núcleo Digital', 50, 40);

      doc.fontSize(12)
         .font('Helvetica')
         .text('Reporte de Madurez Digital de PyMEs', 50, 70);

      // --- INFORMACIÓN DEL LEAD ---
      doc.fillColor(colors.neutralDark)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Datos de la Evaluación', 50, 150);

      doc.moveTo(50, 170).lineTo(562, 170).strokeColor(colors.border).stroke();

      const gridY = 185;
      doc.fontSize(10).font('Helvetica-Bold').text('Nombre:', 50, gridY);
      doc.font('Helvetica').text(leadData.nombre || '-', 130, gridY);

      doc.font('Helvetica-Bold').text('Empresa:', 320, gridY);
      doc.font('Helvetica').text(leadData.empresa || '-', 400, gridY);

      doc.font('Helvetica-Bold').text('Email:', 50, gridY + 20);
      doc.font('Helvetica').text(leadData.email || '-', 130, gridY + 20);

      doc.font('Helvetica-Bold').text('Tamaño:', 320, gridY + 20);
      doc.font('Helvetica').text(`${leadData.tamano_empresa || '-'} emp.`, 400, gridY + 20);

      doc.font('Helvetica-Bold').text('Cargo/Rol:', 50, gridY + 40);
      doc.font('Helvetica').text(leadData.cargo || '-', 130, gridY + 40);

      doc.font('Helvetica-Bold').text('WhatsApp:', 320, gridY + 40);
      doc.font('Helvetica').text(leadData.whatsapp || '-', 400, gridY + 40);

      doc.font('Helvetica-Bold').text('Ubicación:', 50, gridY + 60);
      doc.font('Helvetica').text(`${leadData.ciudad || '-'}, ${leadData.provincia || '-'}`, 130, gridY + 60);

      doc.font('Helvetica-Bold').text('Industria:', 320, gridY + 60);
      doc.font('Helvetica').text(leadData.rubro || '-', 400, gridY + 60);

      // --- RESULTADO / SCORE ---
      const resultY = 280;
      doc.rect(50, resultY, 512, 100).fill(profileColor.bg);

      // Dibujar borde del resultado
      doc.rect(50, resultY, 512, 100).strokeColor(profileColor.primary).stroke();

      // Emoji y Título Perfil
      doc.fillColor(profileColor.text)
         .fontSize(28)
         .text(profileConfig.emoji || '📊', 75, resultY + 15, { lineBreak: false });

      doc.fontSize(18)
         .font('Helvetica-Bold')
         .text(`Perfil: ${profileConfig.title}`, 120, resultY + 18);

      // Puntaje
      doc.fillColor(colors.neutralDark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text(`Score: ${scoreData.score} / 24`, 410, resultY + 20, { align: 'right', width: 130 });

      // Descripción Corta
      doc.fillColor(colors.neutralDark)
         .fontSize(10)
         .font('Helvetica-Oblique')
         .text(profileConfig.desc, 75, resultY + 52, { width: 462, align: 'left', lineGap: 2 });

      // --- RECOMENDACIONES ---
      const recY = 400;
      doc.fillColor(colors.neutralDark)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Próximos Pasos Recomendados', 50, recY);

      doc.moveTo(50, recY + 18).lineTo(562, recY + 18).strokeColor(colors.border).stroke();

      doc.fillColor(colors.neutralDark)
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(profileConfig.ctaTitle || 'Siguiente paso', 50, recY + 30);

      doc.font('Helvetica')
         .fontSize(10)
         .text(profileConfig.ctaText || '', 50, recY + 48, { width: 512, lineGap: 3 });

      // --- RESPUESTAS DETALLADAS (Nueva Página) ---
      doc.addPage();

      doc.fillColor(colors.neutralDark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('Detalle de Respuestas del Diagnóstico', 50, 40);

      doc.moveTo(50, 62).lineTo(562, 62).strokeColor(colors.border).stroke();

      let ansY = 80;
      const answers = scoreData.detailedAnswers || [];

      answers.forEach((ans, index) => {
        // Verificar si la respuesta cabe en la página, sino agregar nueva página
        if (ansY > 700) {
          doc.addPage();
          ansY = 50;
        }

        doc.fillColor(profileColor.primary)
           .fontSize(10)
           .font('Helvetica-Bold')
           .text(`Pregunta ${index + 1}:`, 50, ansY);

        doc.fillColor(colors.neutralDark)
           .font('Helvetica-Bold')
           .text(ans.question, 120, ansY, { width: 442, lineGap: 2 });

        const qHeight = doc.heightOfString(ans.question, { width: 442 });
        ansY += qHeight + 6;

        doc.fillColor(colors.neutralLight)
           .font('Helvetica-Bold')
           .text('Respuesta:', 120, ansY);

        doc.fillColor(colors.neutralDark)
           .font('Helvetica')
           .text(`${ans.answer} (${ans.points} pts)`, 190, ansY, { width: 372 });

        ansY += 32; // Espacio entre preguntas
      });

      // --- PIE DE PÁGINA ---
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fillColor(colors.neutralLight)
           .fontSize(8)
           .text('Pablo Gon | Facilitador Tecnológico  -  Diagnóstico de Madurez Digital', 50, 750, { align: 'left', width: 400 });
        doc.text(`Página ${i + 1} de ${pageCount}`, 450, 750, { align: 'right', width: 112 });
      }

      // Finalizar documento
      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePDF };
