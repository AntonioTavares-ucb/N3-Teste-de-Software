    /// <reference types="cypress" />

    describe('Fluxo E2E do Sistema de Saúde Fetal', () => {
      const examData = {
        baseline_value: 120,
        accelerations: 0.003,
        fetal_movement: 0,
        uterine_contractions: 0.005,
        light_decelerations: 0,
        severe_decelerations: 0,
        prolongued_decelerations: 0,
        abnormal_short_term_variability: 40,
        mean_value_of_short_term_variability: 1.5,
        percentage_of_time_with_abnormal_long_term_variability: 0,
        mean_value_of_long_term_variability: 10,
        histogram_width: 50,
        histogram_min: 100,
        histogram_max: 150,
        histogram_number_of_peaks: 5,
        histogram_number_of_zeroes: 0,
        histogram_mode: 125,
        histogram_mean: 125,
        histogram_median: 125,
        histogram_variance: 5,
        histogram_tendency: 0
      };

      beforeEach(() => {
        cy.request('POST', 'http://localhost:3000/test/cleanup-db')
          .then((response) => {
            expect(response.status).to.eq(200);
            cy.log('Banco de dados limpo com sucesso para o teste.');
          });

        cy.visit('http://localhost:3001');
      });

      it('deve preencher o formulário, enviar e verificar o registro e o histórico', () => {
        const testCpf = '11122233344';

        cy.get('input[name="cpf"]').type(testCpf);

        Object.keys(examData).forEach(key => {
          // @ts-ignore
          cy.get(`input[name="${key}"]`).clear().type(examData[key].toString());
        });

        cy.get('button[type="submit"]').click();

        cy.get('[data-testid="exam-result"]').should('be.visible');
        cy.get('[data-testid="exam-result"]').contains('Saúde Fetal: Normal');

        cy.get('.registros table tbody tr').should('have.length', 1);
        cy.get('.registros table tbody tr').contains(testCpf);
        cy.get('.registros table tbody tr').contains('Normal');
      });

      it('deve exibir erro para CPF inválido', () => {
        const invalidCpf = '123';
        cy.get('input[name="cpf"]').type(invalidCpf);

        Object.keys(examData).forEach(key => {
          // @ts-ignore
          cy.get(`input[name="${key}"]`).clear().type(examData[key].toString());
        });

        cy.get('button[type="submit"]').click();

        cy.on('window:alert', (str: string) => {
          expect(str).to.eq('Erro ao processar exame');
        });
      });
    });
    