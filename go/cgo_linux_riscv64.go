//go:build linux && riscv64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/linux_riscv64 -ltalon
#cgo LDFLAGS: -lpthread -ldl -lm
*/
import "C"
