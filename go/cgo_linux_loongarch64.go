//go:build linux && loong64

package talon

/*
#cgo LDFLAGS: -L${SRCDIR}/../lib/linux_loongarch64 -ltalon
#cgo LDFLAGS: -lpthread -ldl -lm
*/
import "C"
