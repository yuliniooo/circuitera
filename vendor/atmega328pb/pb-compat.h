// Circuitera PB adaptation: Arduino's unnumbered APIs refer to SPI0 and TWI0.
// No ATmega328P device macro is defined. All addresses come from iom328pb.h.
#pragma once
#include <avr/io.h>
#ifndef __AVR_ATmega328PB__
#error PB compatibility header used for the wrong MCU
#endif
#define SPCR SPCR0
#define SPSR SPSR0
#define SPDR SPDR0
#define SPI_STC_vect SPI0_STC_vect
#define TWBR TWBR0
#define TWSR TWSR0
#define TWAR TWAR0
#define TWDR TWDR0
#define TWCR TWCR0
#define TWAMR TWAMR0
#define TWI_vect TWI0_vect
